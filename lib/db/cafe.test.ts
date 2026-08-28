/**
 * Unit tests for lib/db/cafe.ts's createOrder call-site wiring. The
 * data/authz/money-computation contracts are owned by lib/db/cafe.int.test.ts
 * (real DB, real transactions). This file owns ONE thing: proving createOrder
 * actually THREADS its own transaction (`tx`) into every in-tx repository
 * call it makes — never falling through to the global `db` for a second
 * pooled connection while its own transaction still holds one (the
 * pool-deadlock class documented on `getTierDiscounts`, I-040; I-044 fix
 * round 2, item 3).
 *
 * The whole DB layer is mocked so this stays fast/deterministic — no real
 * Postgres connection, no real pool, just call-argument assertions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const TX_MARKER = Symbol("tx");

const dbSelect = vi.fn();
const dbTransaction = vi.fn();
vi.mock("@/lib/db/drizzle", () => ({
  db: {
    select: (...args: unknown[]) => dbSelect(...args),
    transaction: (...args: unknown[]) => dbTransaction(...args),
  },
}));

const getActiveBookingForUpdate = vi.fn();
vi.mock("@/lib/db/bookings", () => ({
  getActiveBookingForUpdate: (...args: unknown[]) => getActiveBookingForUpdate(...args),
}));

const findProfilesByIds = vi.fn();
vi.mock("@/lib/db/users", () => ({
  findProfilesByIds: (...args: unknown[]) => findProfilesByIds(...args),
}));

const getTierDiscounts = vi.fn();
vi.mock("@/lib/db/tier-config", () => ({
  getTierDiscounts: (...args: unknown[]) => getTierDiscounts(...args),
}));

const recordTransaction = vi.fn();
vi.mock("@/lib/db/transactions", () => ({
  recordTransaction: (...args: unknown[]) => recordTransaction(...args),
}));

import { createOrder } from "@/lib/db/cafe";

const FAKE_ORDER = {
  id: "order-1",
  orgId: "org-1",
  code: "abc123",
  customerUserId: "user-1",
  guestName: null,
  notes: null,
  status: "NEW",
  subtotalRupiah: 20000,
  discountRupiah: 1000,
  totalRupiah: 19000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const FAKE_MENU_ITEM = {
  id: "item-1",
  orgId: "org-1",
  name: "Latte",
  priceRupiah: 20000,
  hasVariants: false,
  variantConfig: null,
  available: true,
  archivedAt: null,
};

/** A Drizzle-insert-shaped stub: awaitable directly (resolves `undefined`), and `.returning()` resolves `[FAKE_ORDER]`. */
function fakeInsertBuilder() {
  const resolved = Promise.resolve(undefined);
  return {
    values: () => ({
      returning: () => Promise.resolve([FAKE_ORDER]),
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
    }),
  };
}

describe("createOrder — in-tx call-site wiring (I-044 fix round 2, item 3)", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbTransaction.mockReset();
    getActiveBookingForUpdate.mockReset();
    findProfilesByIds.mockReset();
    getTierDiscounts.mockReset();
    recordTransaction.mockReset();

    // Pre-tx menu lookup (legitimately on the global `db` — outside any
    // transaction, nothing to thread there).
    dbSelect.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([FAKE_MENU_ITEM]) }),
    });

    // The fake transaction: invokes the callback with a `tx` object tagged
    // with TX_MARKER so we can assert exactly THIS object (not the global
    // db) was passed to each in-tx repository call.
    dbTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        [TX_MARKER]: true,
        insert: () => fakeInsertBuilder(),
      };
      return cb(tx);
    });

    getActiveBookingForUpdate.mockResolvedValue({ id: "booking-1", status: "ACTIVE" });
    findProfilesByIds.mockResolvedValue([{ id: "user-1", membershipTier: "GOLD" }]);
    getTierDiscounts.mockResolvedValue({
      coworkingDiscountPct: 0,
      meetingDiscountPct: 0,
      cafeDiscountPct: 5,
      printDiscountPct: 0,
    });
    recordTransaction.mockResolvedValue(undefined);
  });

  it("[SEC][POOL] passes its OWN tx (not the global db) to getActiveBookingForUpdate, findProfilesByIds, and getTierDiscounts", async () => {
    await createOrder({
      orgId: "org-1",
      customerUserId: "user-1",
      guestName: null,
      lines: [{ menuItemId: "item-1", qty: 1 }],
      discountEligible: true,
    });

    expect(getActiveBookingForUpdate).toHaveBeenCalledTimes(1);
    expect(findProfilesByIds).toHaveBeenCalledTimes(1);
    expect(getTierDiscounts).toHaveBeenCalledTimes(1);

    // The exact SAME tx object the transaction callback received — not a
    // bare 2-arg call that would silently default to the global `db`.
    const txArgFromBooking = getActiveBookingForUpdate.mock.calls[0][2] as Record<
      symbol,
      boolean
    >;
    const txArgFromProfiles = findProfilesByIds.mock.calls[0][2] as Record<symbol, boolean>;
    const txArgFromTierDiscounts = getTierDiscounts.mock.calls[0][2] as Record<symbol, boolean>;

    expect(txArgFromBooking?.[TX_MARKER]).toBe(true);
    expect(txArgFromProfiles?.[TX_MARKER]).toBe(true);
    expect(txArgFromTierDiscounts?.[TX_MARKER]).toBe(true);

    // Also confirm the same tx object identity across all three calls (the
    // ONE transaction's connection, not three different fakes).
    expect(txArgFromProfiles).toBe(txArgFromBooking);
    expect(txArgFromTierDiscounts).toBe(txArgFromBooking);
  });

  it("never calls findProfilesByIds/getTierDiscounts when there is no active booking (0% short-circuit, no wasted call)", async () => {
    getActiveBookingForUpdate.mockResolvedValue(null);

    await createOrder({
      orgId: "org-1",
      customerUserId: "user-1",
      guestName: null,
      lines: [{ menuItemId: "item-1", qty: 1 }],
      discountEligible: true,
    });

    expect(findProfilesByIds).not.toHaveBeenCalled();
    expect(getTierDiscounts).not.toHaveBeenCalled();
  });
});
