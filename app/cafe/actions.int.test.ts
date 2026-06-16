/**
 * Integration tests for app/cafe/actions.ts (server action layer).
 *
 * AC-114 (action layer): placeOrder with blank guestName throws GUEST_NAME_REQUIRED
 * and writes nothing to cafe_orders.
 *
 * getSessionUser() is mocked to return null so the guest branch is exercised.
 * All DB writes go against the real Supabase local Postgres.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock getSessionUser to return null (guest / unauthenticated branch)
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn().mockResolvedValue(null),
  requireSession: vi.fn().mockRejectedValue(new Error("UNAUTHENTICATED")),
}));
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { organizations, cafeMenuItems } from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

const SEED_ORG_SLUG = process.env.SEED_ORG_SLUG ?? "flowspace";
let itemId: string;

beforeAll(async () => {
  // Truncate all cafe + user tables for a clean slate
  await testSql`TRUNCATE TABLE "cafe_order_items","cafe_orders","cafe_menu_items","app_users","organizations" RESTART IDENTITY CASCADE`;

  // Seed an org with the expected slug so resolveGuestOrgId can resolve it
  const [org] = await testDb
    .insert(organizations)
    .values({ name: "FlowSpace Test", slug: SEED_ORG_SLUG })
    .returning();

  // Seed a menu item so placeOrder has a valid line to work with
  const [item] = await testDb
    .insert(cafeMenuItems)
    .values({
      orgId: org.id,
      name: "Test Coffee",
      emoji: "☕",
      category: "COFFEE",
      priceRupiah: 20000,
      description: "Integration test coffee",
      hasVariants: false,
      available: true,
    })
    .returning();
  itemId = item.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "cafe_order_items","cafe_orders","cafe_menu_items","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// ---------------------------------------------------------------------------
// Import the action under test
// ---------------------------------------------------------------------------
import { placeOrder } from "@/app/cafe/actions";

describe("app/cafe/actions — placeOrder", () => {
  it("AC-114: placeOrder (guest, blank name) throws GUEST_NAME_REQUIRED and writes nothing", async () => {
    // Count existing orders before the attempt
    const [{ count: before }] =
      await testSql`select count(*)::int as count from cafe_orders`;

    await expect(
      placeOrder({ lines: [{ menuItemId: itemId, qty: 1 }], guestName: "  " }),
    ).rejects.toThrow(/GUEST_NAME_REQUIRED/);

    // No order written
    const [{ count: after }] =
      await testSql`select count(*)::int as count from cafe_orders`;
    expect(after).toBe(before);
  });

  it("AC-114: placeOrder (guest, empty name) throws GUEST_NAME_REQUIRED and writes nothing", async () => {
    const [{ count: before }] =
      await testSql`select count(*)::int as count from cafe_orders`;

    await expect(
      placeOrder({ lines: [{ menuItemId: itemId, qty: 1 }], guestName: "" }),
    ).rejects.toThrow(/GUEST_NAME_REQUIRED/);

    const [{ count: after }] =
      await testSql`select count(*)::int as count from cafe_orders`;
    expect(after).toBe(before);
  });
});
