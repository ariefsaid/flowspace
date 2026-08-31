/**
 * Integration tests for app/(admin)/admin/pos/actions.ts (I-044).
 *
 * AC-713: POS checkout with notes persists the note on the server-computed order.
 * AC-715: a same-org member with no ACTIVE booking → 0% discount.
 * AC-716: a same-org member with an ACTIVE booking → the member's configured
 *   tier cafeDiscountPct, never a hardcoded rate.
 * AC-717: a nonexistent or cross-org email returns not-found, no data leak.
 * AC-718: a forged user id / subtotal / discount is ignored — server resolves
 *   the email/menu and computes everything itself.
 * AC-720: an ACTIVE-booking member selecting Cold persists the option
 *   adjustment, tier discount, total, notes, and line snapshots atomically.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
  requireSession: vi.fn(),
}));

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  organizations,
  appUsers,
  cafeMenuItems,
  bookings,
  facilities,
  membershipTierConfig,
} from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

let orgAId: string;
let orgBId: string;
let cashierId: string;
let activeMemberId: string;
let inactiveMemberId: string;
let scheduledActiveMemberId: string;
let scheduledActiveEndAt: Date;
let latteAId: string;
let variantLatteAId: string;

const ACTIVE_MEMBER_EMAIL = "gold-active@x.test";
const INACTIVE_MEMBER_EMAIL = "regular-inactive@x.test";
const DUPLICATE_EMAIL = "shared@x.test";
const SCHEDULED_ACTIVE_MEMBER_EMAIL = "gold-scheduled-active@x.test";

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "cafe_order_items","cafe_orders","cafe_menu_items","bookings","membership_tier_config","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "POS Org A", slug: "pos-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "POS Org B", slug: "pos-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [cashier] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: "cashier@x.test", name: "Cashier", role: "ADMIN" })
    .returning();
  cashierId = cashier.id;

  const [activeMember] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgAId,
      email: ACTIVE_MEMBER_EMAIL,
      name: "Gold Active",
      role: "MEMBER",
      membershipTier: "GOLD",
    })
    .returning();
  activeMemberId = activeMember.id;

  const [inactiveMember] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgAId,
      email: INACTIVE_MEMBER_EMAIL,
      name: "Regular Inactive",
      role: "MEMBER",
      membershipTier: "REGULAR",
    })
    .returning();
  inactiveMemberId = inactiveMember.id;

  // Cross-org duplicate email — must never be resolved by an orgA lookup.
  await testDb.insert(appUsers).values({
    orgId: orgBId,
    email: DUPLICATE_EMAIL,
    name: "Org B Ghost",
    role: "MEMBER",
    membershipTier: "GOLD",
  });

  await testDb.insert(membershipTierConfig).values([
    { orgId: orgAId, tier: "GOLD", cafeDiscountPct: 10 },
    { orgId: orgAId, tier: "REGULAR", cafeDiscountPct: 0 },
  ]);

  await testDb.insert(bookings).values({
    orgId: orgAId,
    userId: activeMemberId,
    facilityType: "WALKIN_COWORKING",
    facilityName: "Walk-in Coworking",
    startAt: new Date(),
    ratePerHourRupiah: 15000,
    status: "ACTIVE",
    paymentStatus: "WAITING_CASHIER",
    bookingMode: "WALKIN",
    paymentMethod: "cashier",
  });

  // I-047: a second member with a SCHEDULED (fixed end time) ACTIVE booking
  // — proves lookupPosMemberAction surfaces the real facility name + endAt,
  // not just a boolean.
  const [scheduledActiveMember] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgAId,
      email: SCHEDULED_ACTIVE_MEMBER_EMAIL,
      name: "Gold Scheduled Active",
      role: "MEMBER",
      membershipTier: "GOLD",
    })
    .returning();
  scheduledActiveMemberId = scheduledActiveMember.id;
  scheduledActiveEndAt = new Date(Date.now() + 2 * 3_600_000);
  const [meetingRoom] = await testDb
    .insert(facilities)
    .values({ orgId: orgAId, name: "Ruang Rapat Elang", type: "MEETING_ROOM", ratePerHourRupiah: 120000, available: true })
    .returning();
  await testDb.insert(bookings).values({
    orgId: orgAId,
    userId: scheduledActiveMemberId,
    facilityType: "MEETING_ROOM",
    facilityId: meetingRoom.id,
    facilityName: "Ruang Rapat Elang",
    startAt: new Date(),
    endAt: scheduledActiveEndAt,
    durationHours: 2,
    ratePerHourRupiah: 120000,
    status: "ACTIVE",
    paymentStatus: "PAID_ONLINE",
    bookingMode: "SCHEDULED",
    paymentMethod: "online",
  });

  const [latte] = await testDb
    .insert(cafeMenuItems)
    .values({
      orgId: orgAId,
      name: "Latte",
      emoji: "☕",
      category: "COFFEE",
      priceRupiah: 30000,
      description: "POS test latte",
      hasVariants: false,
      available: true,
    })
    .returning();
  latteAId = latte.id;

  const [variantLatte] = await testDb
    .insert(cafeMenuItems)
    .values({
      orgId: orgAId,
      name: "Kopi Susu",
      emoji: "🧋",
      category: "COFFEE",
      priceRupiah: 22000,
      description: "POS test variant item",
      hasVariants: true,
      variantConfig: {
        variants: [
          {
            name: "Temperature",
            required: true,
            options: [
              { name: "Hot", priceAdjustment: 0 },
              { name: "Cold", priceAdjustment: 3000 },
            ],
          },
        ],
      },
      available: true,
    })
    .returning();
  variantLatteAId = variantLatte.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "cafe_order_items","cafe_orders","cafe_menu_items","bookings","membership_tier_config","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

import { lookupPosMemberAction, placePosOrder } from "@/app/(admin)/admin/pos/actions";
import { requireSession } from "@/lib/auth/session";

const mockedRequireSession = requireSession as unknown as ReturnType<typeof vi.fn>;

function asCashier() {
  mockedRequireSession.mockResolvedValueOnce({
    id: cashierId,
    role: "ADMIN",
    orgId: orgAId,
    email: "cashier@x.test",
    name: "Cashier",
  });
}

function asMember() {
  mockedRequireSession.mockResolvedValueOnce({
    id: activeMemberId,
    role: "MEMBER",
    orgId: orgAId,
    email: ACTIVE_MEMBER_EMAIL,
    name: "Gold Active",
  });
}

describe("app/(admin)/admin/pos/actions", () => {
  describe("lookupPosMemberAction", () => {
    it("AC-715: a member with no ACTIVE booking returns 0% discount", async () => {
      asCashier();
      const result = await lookupPosMemberAction(INACTIVE_MEMBER_EMAIL);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(inactiveMemberId);
      expect(result!.hasActiveBooking).toBe(false);
      expect(result!.cafeDiscountPct).toBe(0);
      expect(result!.activeBookingFacility).toBeNull();
      expect(result!.activeBookingEndAt).toBeNull();
    });

    it("AC-716: a member with an ACTIVE booking returns the configured tier cafeDiscountPct, not a hardcoded rate", async () => {
      asCashier();
      const result = await lookupPosMemberAction(ACTIVE_MEMBER_EMAIL);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(activeMemberId);
      expect(result!.hasActiveBooking).toBe(true);
      expect(result!.cafeDiscountPct).toBe(10);
      expect(result!.cafeDiscountPct).not.toBe(15); // ORIG's hardcoded rate (OBS-713) must never leak through
    });

    it("[AC-047-POS1] an ACTIVE walk-in (open-ended) surfaces its facility name and a null end time", async () => {
      asCashier();
      const result = await lookupPosMemberAction(ACTIVE_MEMBER_EMAIL);
      expect(result!.activeBookingFacility).toBe("Walk-in Coworking");
      expect(result!.activeBookingEndAt).toBeNull();
    });

    it("[AC-047-POS2] an ACTIVE scheduled booking surfaces its facility name and real end time", async () => {
      asCashier();
      const result = await lookupPosMemberAction(SCHEDULED_ACTIVE_MEMBER_EMAIL);
      expect(result).not.toBeNull();
      expect(result!.hasActiveBooking).toBe(true);
      expect(result!.activeBookingFacility).toBe("Ruang Rapat Elang");
      expect(result!.activeBookingEndAt).toBe(scheduledActiveEndAt.toISOString());
    });

    it("AC-717: a nonexistent email returns null, no data disclosed", async () => {
      asCashier();
      const result = await lookupPosMemberAction("nobody@x.test");
      expect(result).toBeNull();
    });

    it("AC-717: a cross-org duplicate email is never resolved (org isolation)", async () => {
      asCashier();
      const result = await lookupPosMemberAction(DUPLICATE_EMAIL);
      expect(result).toBeNull();
    });

    it("a non-ADMIN caller is forbidden", async () => {
      asMember();
      await expect(lookupPosMemberAction(ACTIVE_MEMBER_EMAIL)).rejects.toThrow(/FORBIDDEN/);
    });
  });

  describe("placePosOrder", () => {
    it("AC-713: notes are persisted on the server-computed order", async () => {
      asCashier();
      const order = await placePosOrder({
        lines: [{ menuItemId: latteAId, qty: 1 }],
        notes: "  extra hot  ",
      });
      expect(order.notes).toBe("extra hot");
      expect(order.totalRupiah).toBe(30000);
    });

    it("AC-718: a forged customerUserId/subtotal/discount on the input type is structurally impossible — only email/lines/notes are read", async () => {
      asCashier();
      // Cast simulates an attacker-controlled payload; TS would normally
      // reject these fields — the server must ignore them regardless.
      const forged = {
        lines: [{ menuItemId: latteAId, qty: 1 }],
        userId: activeMemberId,
        subtotalRupiah: 1,
        discountRupiah: 999999,
        customerUserId: "not-a-real-id",
      } as unknown as Parameters<typeof placePosOrder>[0];
      const order = await placePosOrder(forged);
      expect(order.customerUserId).toBeNull(); // no email supplied → unowned, forged id ignored
      expect(order.subtotalRupiah).toBe(30000); // real server-computed price, not the forged 1
      expect(order.discountRupiah).toBe(0);
    });

    it("AC-720: an ACTIVE-booking member selecting Cold persists option adjustment + tier discount + notes atomically", async () => {
      asCashier();
      const order = await placePosOrder({
        email: ACTIVE_MEMBER_EMAIL,
        lines: [
          {
            menuItemId: variantLatteAId,
            qty: 1,
            options: [{ variantName: "Temperature", optionName: "Cold" }],
          },
        ],
        notes: "less ice",
      });
      expect(order.customerUserId).toBe(activeMemberId);
      expect(order.notes).toBe("less ice");
      // 22000 + 3000 = 25000 subtotal; GOLD 10% discount = round(25000*0.1) = 2500
      expect(order.subtotalRupiah).toBe(25000);
      expect(order.discountRupiah).toBe(2500);
      expect(order.totalRupiah).toBe(22500);
    });

    it("an unresolved email throws MEMBER_NOT_FOUND with no order written", async () => {
      asCashier();
      const [{ count: before }] =
        await testSql`select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      await expect(
        placePosOrder({ email: "nobody@x.test", lines: [{ menuItemId: latteAId, qty: 1 }] }),
      ).rejects.toThrow(/MEMBER_NOT_FOUND/);
      const [{ count: after }] =
        await testSql`select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });

    it("a non-ADMIN caller is forbidden", async () => {
      asMember();
      await expect(
        placePosOrder({ lines: [{ menuItemId: latteAId, qty: 1 }] }),
      ).rejects.toThrow(/FORBIDDEN/);
    });
  });
});
