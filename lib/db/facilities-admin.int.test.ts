/**
 * Integration tests for lib/db/facilities-admin.ts (I-042 admin-settings
 * foundation). [SEC] money-adjacent: booking reads ratePerHourRupiah from
 * this table, so writes validate a non-negative integer rate/capacity/cap
 * server-side before ever touching the row.
 *
 * AC-1110: createFacility inserts; listFacilitiesForAdmin returns it
 * AC-1111: updateFacility patches fields in place
 * AC-1112: archiveFacility soft-archives — row stays, archivedAt is set, excluded from the default list
 * AC-1113: negative/non-integer rate is rejected — no write
 * AC-1114: negative capacity/maxHoursCap is rejected — no write
 * AC-1115: org isolation — org B never sees org A's facilities
 * AC-1116: updateFacility ignores a crafted orgId/id/archivedAt in the patch — mass-assignment is blocked
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { organizations, facilities } from "@/lib/db/schema";
import {
  listFacilitiesForAdmin,
  createFacility,
  updateFacility,
  archiveFacility,
} from "@/lib/db/facilities-admin";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

let orgAId: string;
let orgBId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "facilities","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Facilities Admin Org A", slug: "facilities-admin-org-a" })
    .returning();
  orgAId = orgA.id;

  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Facilities Admin Org B", slug: "facilities-admin-org-b" })
    .returning();
  orgBId = orgB.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "facilities","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("lib/db/facilities-admin", () => {
  it("AC-1110: createFacility inserts; listFacilitiesForAdmin returns it", async () => {
    const created = await createFacility(orgAId, {
      name: "Desk M",
      type: "COWORKING_SEAT",
      ratePerHourRupiah: 25_000,
      capacity: 1,
      seatLabel: "M",
      zone: "DESK",
      maxHoursCap: 4,
    });
    expect(created.id).toBeTruthy();
    expect(created.ratePerHourRupiah).toBe(25_000);

    const rows = await listFacilitiesForAdmin(orgAId);
    expect(rows.map((r) => r.id)).toContain(created.id);
  });

  it("AC-1111: updateFacility patches fields in place", async () => {
    const created = await createFacility(orgAId, {
      name: "Meeting Room Z",
      type: "MEETING_ROOM",
      ratePerHourRupiah: 100_000,
      capacity: 6,
    });

    await updateFacility(orgAId, created.id, { ratePerHourRupiah: 120_000, capacity: 8 });

    const rows = await listFacilitiesForAdmin(orgAId);
    const updated = rows.find((r) => r.id === created.id);
    expect(updated).toMatchObject({ ratePerHourRupiah: 120_000, capacity: 8, name: "Meeting Room Z" });
  });

  it("AC-1112: archiveFacility soft-archives — row stays, archivedAt is set, excluded from the default list", async () => {
    const created = await createFacility(orgAId, {
      name: "Desk To Archive",
      type: "COWORKING_SEAT",
      ratePerHourRupiah: 20_000,
    });

    await archiveFacility(orgAId, created.id);

    const rows = await listFacilitiesForAdmin(orgAId);
    expect(rows.map((r) => r.id)).not.toContain(created.id);

    const [rawRow] = await testDb.select().from(facilities).where(eq(facilities.id, created.id));
    expect(rawRow).toBeDefined();
    expect(rawRow.archivedAt).not.toBeNull();
  });

  it("AC-1113: negative/non-integer rate is rejected — no write", async () => {
    await expect(
      createFacility(orgAId, { name: "Bad Rate", type: "COWORKING_SEAT", ratePerHourRupiah: -1 }),
    ).rejects.toThrow("INVALID_RATE");
    await expect(
      createFacility(orgAId, { name: "Bad Rate 2", type: "COWORKING_SEAT", ratePerHourRupiah: 1.5 }),
    ).rejects.toThrow("INVALID_RATE");

    const rows = await testDb
      .select()
      .from(facilities)
      .where(and(eq(facilities.orgId, orgAId), eq(facilities.name, "Bad Rate")));
    expect(rows).toHaveLength(0);
  });

  it("AC-1114: negative capacity/maxHoursCap is rejected — no write", async () => {
    await expect(
      createFacility(orgAId, {
        name: "Bad Capacity",
        type: "COWORKING_SEAT",
        ratePerHourRupiah: 10_000,
        capacity: -1,
      }),
    ).rejects.toThrow("INVALID_CAPACITY");
    await expect(
      createFacility(orgAId, {
        name: "Bad Cap Hours",
        type: "COWORKING_SEAT",
        ratePerHourRupiah: 10_000,
        maxHoursCap: -2,
      }),
    ).rejects.toThrow("INVALID_MAX_HOURS_CAP");

    const rows = await testDb
      .select()
      .from(facilities)
      .where(and(eq(facilities.orgId, orgAId), eq(facilities.name, "Bad Capacity")));
    expect(rows).toHaveLength(0);
  });

  it("AC-1115: org isolation — org B never sees org A's facilities", async () => {
    await createFacility(orgAId, {
      name: "Org A Only",
      type: "COWORKING_SEAT",
      ratePerHourRupiah: 15_000,
    });

    const bRows = await listFacilitiesForAdmin(orgBId);
    expect(bRows.map((r) => r.name)).not.toContain("Org A Only");
  });

  it("AC-1116: updateFacility ignores a crafted orgId/id/archivedAt in the patch — mass-assignment is blocked", async () => {
    const victim = await createFacility(orgAId, {
      name: "Mass-Assignment Target",
      type: "COWORKING_SEAT",
      ratePerHourRupiah: 30_000,
    });
    const other = await createFacility(orgAId, {
      name: "Other Row",
      type: "COWORKING_SEAT",
      ratePerHourRupiah: 10_000,
    });

    // A crafted payload — as a raw JSON body over the wire could carry these
    // keys regardless of the TS type — must not reassign org, retarget the
    // row, or flip archivedAt.
    const evilPatch = {
      ratePerHourRupiah: 45_000,
      orgId: orgBId,
      id: other.id,
      archivedAt: new Date(),
    } as unknown as Parameters<typeof updateFacility>[2];

    await updateFacility(orgAId, victim.id, evilPatch);

    const [row] = await testDb.select().from(facilities).where(eq(facilities.id, victim.id));
    expect(row).toBeDefined();
    expect(row.orgId).toBe(orgAId);
    expect(row.ratePerHourRupiah).toBe(45_000);
    expect(row.archivedAt).toBeNull();

    const [otherRow] = await testDb.select().from(facilities).where(eq(facilities.id, other.id));
    expect(otherRow.ratePerHourRupiah).toBe(10_000);

    const aRows = await listFacilitiesForAdmin(orgAId);
    expect(aRows.map((r) => r.id)).toContain(victim.id);
    const bRows = await listFacilitiesForAdmin(orgBId);
    expect(bRows.map((r) => r.id)).not.toContain(victim.id);
  });
});
