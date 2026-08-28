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
import {
  organizations,
  cafeMenuItems,
  appUsers,
  bookings,
  membershipTierConfig,
} from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

const SEED_ORG_SLUG = process.env.SEED_ORG_SLUG ?? "flowspace";
let itemId: string;
let orgId: string;
let memberId: string;

beforeAll(async () => {
  // Truncate all cafe + user tables for a clean slate
  await testSql`TRUNCATE TABLE "cafe_order_items","cafe_orders","cafe_menu_items","bookings","membership_tier_config","app_users","organizations" RESTART IDENTITY CASCADE`;

  // Seed an org with the expected slug so resolveGuestOrgId can resolve it
  const [org] = await testDb
    .insert(organizations)
    .values({ name: "FlowSpace Test", slug: SEED_ORG_SLUG })
    .returning();
  orgId = org.id;

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

  // An eligible member: GOLD tier (10% cafe discount) + an ACTIVE booking.
  const [member] = await testDb
    .insert(appUsers)
    .values({
      orgId: org.id,
      email: "gold-member@x.test",
      name: "Gold Member",
      role: "MEMBER",
      membershipTier: "GOLD",
    })
    .returning();
  memberId = member.id;

  await testDb.insert(membershipTierConfig).values({
    orgId: org.id,
    tier: "GOLD",
    cafeDiscountPct: 10,
  });

  await testDb.insert(bookings).values({
    orgId: org.id,
    userId: member.id,
    facilityType: "WALKIN_COWORKING",
    facilityName: "Walk-in Coworking",
    startAt: new Date(),
    ratePerHourRupiah: 15000,
    status: "ACTIVE",
    paymentStatus: "WAITING_CASHIER",
    bookingMode: "WALKIN",
    paymentMethod: "cashier",
  });
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "cafe_order_items","cafe_orders","cafe_menu_items","bookings","membership_tier_config","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// ---------------------------------------------------------------------------
// Import the action under test + the mocked session helper
// ---------------------------------------------------------------------------
import { placeOrder } from "@/app/cafe/actions";
import { getSessionUser } from "@/lib/auth/session";

const mockedGetSessionUser = getSessionUser as unknown as ReturnType<typeof vi.fn>;

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

  it("AC-710: guest checkout with notes stores a no-discount NEW order with guest name + notes + total", async () => {
    const order = await placeOrder({
      lines: [{ menuItemId: itemId, qty: 1 }],
      guestName: "Sari",
      notes: "  extra hot please  ",
    });
    expect(order.guestName).toBe("Sari");
    expect(order.customerUserId).toBeNull();
    expect(order.discountRupiah).toBe(0);
    expect(order.status).toBe("NEW");
    expect(order.notes).toBe("extra hot please");
    expect(order.totalRupiah).toBe(order.subtotalRupiah);
  });

  it("AC-711: an eligible member's checkout stores notes, member ownership, and the tier-resolved discount", async () => {
    mockedGetSessionUser.mockResolvedValueOnce({
      id: memberId,
      role: "MEMBER",
      orgId,
      email: "gold-member@x.test",
      name: "Gold Member",
    });

    const order = await placeOrder({
      lines: [{ menuItemId: itemId, qty: 1 }],
      notes: "less sugar",
    });
    expect(order.customerUserId).toBe(memberId);
    expect(order.guestName).toBeNull();
    expect(order.notes).toBe("less sugar");
    // GOLD tier cafeDiscountPct = 10% of 20000 = 2000
    expect(order.discountRupiah).toBe(2000);
    expect(order.totalRupiah).toBe(18000);
  });

  it("AC-712: blank guest notes store null; over-500-char notes are rejected with no write", async () => {
    const blank = await placeOrder({
      lines: [{ menuItemId: itemId, qty: 1 }],
      guestName: "Budi",
      notes: "   ",
    });
    expect(blank.notes).toBeNull();

    const [{ count: before }] =
      await testSql`select count(*)::int as count from cafe_orders`;
    await expect(
      placeOrder({
        lines: [{ menuItemId: itemId, qty: 1 }],
        guestName: "Budi",
        notes: "a".repeat(501),
      }),
    ).rejects.toThrow(/INVALID_NOTES/);
    const [{ count: after }] =
      await testSql`select count(*)::int as count from cafe_orders`;
    expect(after).toBe(before);
  });
});
