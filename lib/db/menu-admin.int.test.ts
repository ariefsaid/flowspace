/**
 * Integration tests for lib/db/menu-admin.ts (I-042 admin-settings
 * foundation). [SEC] money-adjacent: the cafe order flow reads priceRupiah
 * from this table, so writes validate a non-negative integer price
 * server-side before ever touching the row. Leaves variantConfig alone.
 *
 * AC-1120: createMenuItem inserts; listMenuForAdmin returns it
 * AC-1121: updateMenuItem patches fields in place
 * AC-1122: toggleAvailable flips available true<->false
 * AC-1123: archiveMenuItem soft-archives — row stays, archivedAt is set, excluded from the default list
 * AC-1124: negative/non-integer price is rejected — no write
 * AC-1125: org isolation — org B never sees org A's menu items
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { organizations, cafeMenuItems } from "@/lib/db/schema";
import {
  listMenuForAdmin,
  createMenuItem,
  updateMenuItem,
  toggleAvailable,
  archiveMenuItem,
} from "@/lib/db/menu-admin";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

let orgAId: string;
let orgBId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "cafe_menu_items","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Menu Admin Org A", slug: "menu-admin-org-a" })
    .returning();
  orgAId = orgA.id;

  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Menu Admin Org B", slug: "menu-admin-org-b" })
    .returning();
  orgBId = orgB.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "cafe_menu_items","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("lib/db/menu-admin", () => {
  it("AC-1120: createMenuItem inserts; listMenuForAdmin returns it", async () => {
    const created = await createMenuItem(orgAId, {
      name: "Kopi Susu",
      emoji: "☕",
      category: "COFFEE",
      priceRupiah: 18_000,
      description: "Signature milk coffee",
    });
    expect(created.id).toBeTruthy();
    expect(created.priceRupiah).toBe(18_000);

    const rows = await listMenuForAdmin(orgAId);
    expect(rows.map((r) => r.id)).toContain(created.id);
  });

  it("AC-1121: updateMenuItem patches fields in place", async () => {
    const created = await createMenuItem(orgAId, {
      name: "Nasi Goreng",
      emoji: "\u{1F35B}",
      category: "FOOD",
      priceRupiah: 25_000,
      description: "Fried rice",
    });

    await updateMenuItem(orgAId, created.id, { priceRupiah: 28_000, name: "Nasi Goreng Spesial" });

    const rows = await listMenuForAdmin(orgAId);
    const updated = rows.find((r) => r.id === created.id);
    expect(updated).toMatchObject({ priceRupiah: 28_000, name: "Nasi Goreng Spesial" });
  });

  it("AC-1122: toggleAvailable flips available true<->false", async () => {
    const created = await createMenuItem(orgAId, {
      name: "Es Teh",
      emoji: "\u{1F9CB}",
      category: "NON_COFFEE",
      priceRupiah: 8_000,
      description: "Iced tea",
    });
    expect(created.available).toBe(true);

    await toggleAvailable(orgAId, created.id, false);
    let rows = await listMenuForAdmin(orgAId);
    expect(rows.find((r) => r.id === created.id)?.available).toBe(false);

    await toggleAvailable(orgAId, created.id, true);
    rows = await listMenuForAdmin(orgAId);
    expect(rows.find((r) => r.id === created.id)?.available).toBe(true);
  });

  it("AC-1123: archiveMenuItem soft-archives — row stays, archivedAt is set, excluded from the default list", async () => {
    const created = await createMenuItem(orgAId, {
      name: "To Archive",
      emoji: "\u{1F36A}",
      category: "SNACK",
      priceRupiah: 5_000,
      description: "Cookie",
    });

    await archiveMenuItem(orgAId, created.id);

    const rows = await listMenuForAdmin(orgAId);
    expect(rows.map((r) => r.id)).not.toContain(created.id);

    const [rawRow] = await testDb.select().from(cafeMenuItems).where(eq(cafeMenuItems.id, created.id));
    expect(rawRow).toBeDefined();
    expect(rawRow.archivedAt).not.toBeNull();
  });

  it("AC-1124: negative/non-integer price is rejected — no write", async () => {
    await expect(
      createMenuItem(orgAId, {
        name: "Bad Price",
        emoji: "☕",
        category: "COFFEE",
        priceRupiah: -1,
        description: "x",
      }),
    ).rejects.toThrow("INVALID_PRICE");
    await expect(
      createMenuItem(orgAId, {
        name: "Bad Price 2",
        emoji: "☕",
        category: "COFFEE",
        priceRupiah: 1.5,
        description: "x",
      }),
    ).rejects.toThrow("INVALID_PRICE");

    const rows = await testDb
      .select()
      .from(cafeMenuItems)
      .where(and(eq(cafeMenuItems.orgId, orgAId), eq(cafeMenuItems.name, "Bad Price")));
    expect(rows).toHaveLength(0);
  });

  it("AC-1125: org isolation — org B never sees org A's menu items", async () => {
    await createMenuItem(orgAId, {
      name: "Org A Only",
      emoji: "☕",
      category: "COFFEE",
      priceRupiah: 12_000,
      description: "x",
    });

    const bRows = await listMenuForAdmin(orgBId);
    expect(bRows.map((r) => r.name)).not.toContain("Org A Only");
  });
});
