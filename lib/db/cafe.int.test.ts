/**
 * Integration tests for lib/db/cafe.ts
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * AC-100: listMenu returns only org-scoped, available, non-archived items
 * AC-112: createOrder persists member order with server-computed totals
 * AC-113: guest order captures name, no discount, customerUserId null
 * AC-114: order with zero valid lines is rejected, no write
 * AC-122: advanceOrderStatus walks NEW→PREPARING→READY→COMPLETED, then rejects
 * AC-123: a MEMBER-role actor cannot advance status — server-side deny, no write
 * AC-124: advanceOrderStatus on a cross-org order forbids, no write
 * AC-125: listOrders / getOrder returns org-scoped orders with items + customer
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock only generateOrderCode (keep nextStatus real) so AC-728 can force a
// collision deterministically; default implementation delegates to the real
// generator so every other test still gets a real random 6-char code.
vi.mock("@/lib/cafe/status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cafe/status")>();
  return { ...actual, generateOrderCode: vi.fn(actual.generateOrderCode) };
});
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  cafeMenuItems,
  cafeOrders,
  cafeOrderItems,
  membershipTierConfig,
  bookings,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Dedicated Drizzle + postgres-js client for test DB — never uses the app's singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let bUserId: string;
let latteAId: string;
let croissantAId: string;
let orgBItemId: string;
let variantLatteAId: string;

beforeAll(async () => {
  // Truncate via raw sql (postgres-js) to avoid Drizzle execute hang on
  // Supabase Postgres in the vitest worker environment.
  await testSql`TRUNCATE TABLE "bookings","cafe_order_items","cafe_orders","cafe_menu_items","membership_tier_config","app_users","organizations" RESTART IDENTITY CASCADE`;

  // Seed two orgs
  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Cafe Org A", slug: "cafe-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Cafe Org B", slug: "cafe-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Seed one user per org
  const [userA] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgAId,
      email: "cafe-a@x.test",
      name: "Alice",
      role: "MEMBER",
    })
    .returning();
  const [userB] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgBId,
      email: "cafe-b@x.test",
      name: "Bob",
      role: "MEMBER",
    })
    .returning();
  aUserId = userA.id;
  bUserId = userB.id;

  // Pricing config (I-027): the cafe discount is now config-driven — seed the
  // member tier (REGULAR) cafe rate to 5% so an eligible order discounts.
  await testDb.insert(membershipTierConfig).values([
    { orgId: orgAId, tier: "REGULAR", cafeDiscountPct: 5, printDiscountPct: 0 },
    { orgId: orgBId, tier: "REGULAR", cafeDiscountPct: 5, printDiscountPct: 0 },
  ]);

  // Seed menu items for org A: 2 available + 1 unavailable + 1 archived
  const [latte] = await testDb
    .insert(cafeMenuItems)
    .values({
      orgId: orgAId,
      name: "Latte",
      emoji: "☕",
      category: "COFFEE",
      priceRupiah: 32000,
      description: "Smooth latte",
      hasVariants: false,
      available: true,
    })
    .returning();
  latteAId = latte.id;

  const [croissant] = await testDb
    .insert(cafeMenuItems)
    .values({
      orgId: orgAId,
      name: "Croissant",
      emoji: "🥐",
      category: "FOOD",
      priceRupiah: 25000,
      description: "Buttery croissant",
      hasVariants: false,
      available: true,
    })
    .returning();
  croissantAId = croissant.id;

  // Variant-enabled item (I-044): Temperature (required) × Sugar (required).
  const [variantLatte] = await testDb
    .insert(cafeMenuItems)
    .values({
      orgId: orgAId,
      name: "Kopi Susu",
      emoji: "🧋",
      category: "COFFEE",
      priceRupiah: 22000,
      description: "Kopi susu with configurable variants",
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
          {
            name: "Sugar",
            required: true,
            options: [
              { name: "Normal Sugar", priceAdjustment: 0 },
              { name: "Less Sugar", priceAdjustment: 0 },
              { name: "No Sugar", priceAdjustment: 0 },
            ],
          },
        ],
      },
      available: true,
    })
    .returning();
  variantLatteAId = variantLatte.id;

  // Unavailable item — should NOT appear in listMenu
  await testDb.insert(cafeMenuItems).values({
    orgId: orgAId,
    name: "HiddenItem",
    emoji: "🙈",
    category: "SNACK",
    priceRupiah: 10000,
    description: "Not available",
    hasVariants: false,
    available: false,
  });

  // Archived item — should NOT appear in listMenu
  await testDb.insert(cafeMenuItems).values({
    orgId: orgAId,
    name: "ArchivedItem",
    emoji: "📦",
    category: "SNACK",
    priceRupiah: 10000,
    description: "Archived",
    hasVariants: false,
    available: true,
    archivedAt: new Date(),
  });

  // Org B's menu item
  const [orgBItem] = await testDb
    .insert(cafeMenuItems)
    .values({
      orgId: orgBId,
      name: "OrgBItem",
      emoji: "🅱",
      category: "COFFEE",
      priceRupiah: 15000,
      description: "Belongs to org B",
      hasVariants: false,
      available: true,
    })
    .returning();
  orgBItemId = orgBItem.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "bookings","cafe_order_items","cafe_orders","cafe_menu_items","membership_tier_config","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// ---------------------------------------------------------------------------
// Import the repository functions under test
// ---------------------------------------------------------------------------
import {
  listMenu,
  createOrder,
  advanceOrderStatus,
  listOrders,
  getOrder,
  setOrderStatus,
  listRecentOrdersByUser,
} from "@/lib/db/cafe";
import { advanceOrderStatusAsActor } from "@/lib/cafe/authz";
import { generateOrderCode } from "@/lib/cafe/status";

const mockedGenerateOrderCode = generateOrderCode as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Deterministic ROW-LOCK barrier (fix round 2, item 2): proves createOrder's
// in-tx active-booking recheck takes a REAL `SELECT ... FOR UPDATE` on the
// booking row, not a plain unlocked SELECT. A holder transaction grabs the
// row lock FIRST (via `FOR UPDATE`), starts both racing ops, and polls
// `pg_locks` (NOT-granted rows) until the expected number of backends are
// genuinely BLOCKED waiting on a lock before releasing — the exact same
// technique (a `pg_locks`-based, not `pg_stat_activity`-based, poll — the
// latter proved unreliably slow to update within a short deadline in this
// environment) the advisory-lock barrier in lib/db/bookings.int.test.ts
// uses, generalized from `locktype = 'advisory'` to ANY not-granted lock
// (a row-level FOR UPDATE wait has no fixed advisory key to target). If
// createOrder's recheck were still a plain unlocked SELECT, it
// would never contend for this row's lock at all — the waiter count would
// never reach `waiters` and this helper would time out, which IS the RED
// signal for the unfixed code.
// ---------------------------------------------------------------------------
async function runWithRowLockBarrier(
  bookingId: string,
  waiters: number,
  // Heterogeneous ops (e.g. createOrder resolving CafeOrder vs. a raw update
  // resolving something else) — callers narrow each settled result's `.value`
  // themselves.
  ops: Array<() => Promise<unknown>>,
): Promise<PromiseSettledResult<unknown>[]> {
  let racePromise!: Promise<PromiseSettledResult<unknown>[]>;
  await testSql.begin(async (holder) => {
    await holder`select * from bookings where id = ${bookingId} for update`;
    racePromise = Promise.allSettled(ops.map((op) => op()));
    const deadline = Date.now() + 3000;
    for (;;) {
      const rows = await holder.unsafe<{ n: number }[]>(
        `select count(*)::int as n from pg_locks where not granted and pid <> pg_backend_pid()`,
      );
      if (Number(rows[0]?.n ?? 0) >= waiters) break;
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${waiters} row-lock waiter(s) on booking ${bookingId}`);
      }
      await new Promise((r) => setTimeout(r, 15));
    }
    // Returning here ends the holder's transaction (COMMIT), releasing the
    // row lock and letting every genuinely-waiting op proceed for real.
  });
  return racePromise;
}

describe("lib/db/cafe", () => {
  // -------------------------------------------------------------------------
  // C1 — listMenu
  // -------------------------------------------------------------------------
  describe("listMenu", () => {
    it("AC-100: listMenu returns only orgA available, non-archived items, ordered by category then name", async () => {
      const items = await listMenu(orgAId);
      expect(items.every((i) => i.orgId === orgAId)).toBe(true);
      const names = items.map((i) => i.name);
      expect(names).not.toContain("HiddenItem");
      expect(names).not.toContain("ArchivedItem");
      expect(names).not.toContain("OrgBItem");
      // Latte (COFFEE) and Croissant (FOOD) should be present
      expect(names).toContain("Latte");
      expect(names).toContain("Croissant");
      // Ordered by category then name (the AC-100 title's ordering claim).
      const ordered = [...items].sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      );
      expect(items.map((i) => i.id)).toEqual(ordered.map((i) => i.id));
    });

    it("AC-100: listMenu org isolation — orgB call does not return orgA items", async () => {
      const items = await listMenu(orgBId);
      expect(items.every((i) => i.orgId === orgBId)).toBe(true);
      const names = items.map((i) => i.name);
      expect(names).not.toContain("Latte");
      expect(names).not.toContain("Croissant");
      expect(names).toContain("OrgBItem");
    });
  });

  // -------------------------------------------------------------------------
  // C2 — createOrder (member path + cross-org rejection)
  // -------------------------------------------------------------------------
  describe("createOrder — member + cross-org guard", () => {
    it("AC-112 / AC-723: createOrder persists member order with server totals, NEW, unique code, line snapshots", async () => {
      const order = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [
          { menuItemId: latteAId, qty: 1 },
          { menuItemId: croissantAId, qty: 2 },
        ],
        discountEligible: false,
      });
      expect(order.orgId).toBe(orgAId);
      expect(order.customerUserId).toBe(aUserId);
      expect(order.guestName).toBeNull();
      expect(order.status).toBe("NEW");
      // latte=32000, croissant=25000*2=50000 → subtotal=82000
      expect(order.subtotalRupiah).toBe(82000);
      expect(order.totalRupiah).toBe(82000);
      expect(order.discountRupiah).toBe(0);
      expect(order.code).toMatch(/^[0-9a-z]{6}$/);

      const items = await testDb
        .select()
        .from(cafeOrderItems)
        .where(eq(cafeOrderItems.orderId, order.id));
      const latte = items.find((i) => i.menuItemId === latteAId);
      expect(latte?.unitPriceRupiah).toBe(32000);
      expect(latte?.nameSnapshot).toBe("Latte");
      const crossnt = items.find((i) => i.menuItemId === croissantAId);
      expect(crossnt?.unitPriceRupiah).toBe(25000);
      expect(crossnt?.nameSnapshot).toBe("Croissant");
    });

    it("AC-112: createOrder persists the server-computed 5% discount when discountEligible AND the member has a live ACTIVE booking", async () => {
      // Give aUserId a live ACTIVE booking — the discount is only granted when
      // createOrder's own re-check (not just the caller's `discountEligible`
      // flag) finds one (I-044 [MONEY] TOCTOU fix).
      const [activeBooking] = await testDb
        .insert(bookings)
        .values({
          orgId: orgAId,
          userId: aUserId,
          facilityType: "WALKIN_COWORKING",
          facilityName: "Walk-in Coworking",
          ratePerHourRupiah: 10000,
          status: "ACTIVE",
        })
        .returning();

      // Same lines as above (subtotal 82000); eligible member → 5% off recorded.
      const order = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [
          { menuItemId: latteAId, qty: 1 },
          { menuItemId: croissantAId, qty: 2 },
        ],
        discountEligible: true,
      });
      expect(order.subtotalRupiah).toBe(82000);
      expect(order.discountRupiah).toBe(4100); // round(82000 * 0.05)
      expect(order.totalRupiah).toBe(77900);

      // Clean up: complete the booking so it doesn't linger ACTIVE for other
      // tests in this file.
      await testDb
        .update(bookings)
        .set({ status: "COMPLETED" })
        .where(eq(bookings.id, activeBooking.id));
    });

    it("[MONEY] AC-115/TOCTOU: a booking cancelled between eligibility-resolve and order-write gets 0% discount, not the stale value", async () => {
      // Simulates the real race across the two live callers (app/cafe/actions.ts,
      // app/(admin)/admin/pos/actions.ts): the action resolves `discountEligible`
      // from a snapshot read, THEN (before createOrder's write lands) the
      // member's booking is cancelled. createOrder must re-derive eligibility
      // itself, live, immediately before the write — never trust the
      // already-stale boolean the action passed in.
      const [staleBooking] = await testDb
        .insert(bookings)
        .values({
          orgId: orgAId,
          userId: aUserId,
          facilityType: "WALKIN_COWORKING",
          facilityName: "Walk-in Coworking",
          ratePerHourRupiah: 10000,
          status: "ACTIVE",
        })
        .returning();

      // Step 1: the action's earlier eligibility check would have resolved
      // `discountEligible = true` here (there IS an ACTIVE booking at this
      // point in time).
      const staleDiscountEligible = true;

      // Step 2: the booking is cancelled — e.g. the member cancels their
      // coworking session in a separate request — before the order commits.
      await testDb
        .update(bookings)
        .set({ status: "CANCELLED" })
        .where(eq(bookings.id, staleBooking.id));

      // Step 3: createOrder is called with the now-STALE `discountEligible`
      // boolean from step 1. A vulnerable implementation trusts it blindly and
      // still applies the 5% discount; the fixed implementation re-checks
      // live and finds no ACTIVE booking → 0% discount.
      const order = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }], // subtotal 32000
        discountEligible: staleDiscountEligible,
      });

      expect(order.subtotalRupiah).toBe(32000);
      expect(order.discountRupiah).toBe(0);
      expect(order.totalRupiah).toBe(32000);
    });

    it("[HIGH][MONEY] TOCTOU (row lock): createOrder's active-booking recheck genuinely row-locks the booking — a concurrent cancel cannot land between the recheck and the order write (deterministic lock barrier)", async () => {
      const [booking] = await testDb
        .insert(bookings)
        .values({
          orgId: orgAId,
          userId: aUserId,
          facilityType: "WALKIN_COWORKING",
          facilityName: "Walk-in Coworking",
          ratePerHourRupiah: 10000,
          status: "ACTIVE",
        })
        .returning();

      const orderOp = () =>
        createOrder({
          orgId: orgAId,
          customerUserId: aUserId,
          guestName: null,
          lines: [{ menuItemId: latteAId, qty: 1 }], // subtotal 32000
          discountEligible: true,
        });
      const cancelOp = () =>
        testDb.update(bookings).set({ status: "CANCELLED" }).where(eq(bookings.id, booking.id));

      // The barrier itself is the proof: it requires 2 backends to be
      // GENUINELY blocked, simultaneously, on this exact booking row before
      // it releases. A plain unlocked SELECT (the pre-fix code) never
      // contends for the row lock at all — only `cancelOp`'s UPDATE would
      // ever show up as a waiter, the count would never reach 2, and this
      // call would throw a timeout (the RED signal for the unfixed code).
      const [orderResult, cancelResult] = await runWithRowLockBarrier(
        booking.id,
        2,
        [orderOp, cancelOp],
      );

      expect(orderResult.status).toBe("fulfilled");
      expect(cancelResult.status).toBe("fulfilled");
      const order = (orderResult as PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>>)
        .value;

      const [freshBooking] = await testDb.select().from(bookings).where(eq(bookings.id, booking.id));
      expect(freshBooking.status).toBe("CANCELLED"); // the cancel always eventually applies

      // The row lock makes the two operations strictly serialize on this
      // booking row — there is NO interleaving where cancel's UPDATE commits
      // WHILE order's transaction is between its recheck and its insert.
      // Whichever op actually won the lock queue after the barrier released,
      // the discount is self-consistent with a fully-serialized ordering:
      if (order.discountRupiah > 0) {
        // order's row-locked recheck won the queue first (read ACTIVE,
        // applied the discount, then committed) — cancel's UPDATE was
        // BLOCKED (proven by the barrier above) until order's whole
        // transaction released the lock, so it could only land AFTER.
        expect(order.discountRupiah).toBe(1600); // 5% of 32000
        expect(order.totalRupiah).toBe(30400);
      } else {
        // cancel's UPDATE won the queue first and committed before order's
        // row-locked recheck re-read the row — order correctly saw
        // CANCELLED and applied 0%.
        expect(order.discountRupiah).toBe(0);
        expect(order.totalRupiah).toBe(32000);
      }
    });

    it("AC-112 / AC-704: createOrder accepts the same item on two lines (multi-variant drink: hot + cold)", async () => {
      // A member orders one Kopi Susu hot + one Kopi Susu cold — two lines,
      // same menuItemId. The cross-org guard must validate distinct ids, not
      // raw line count.
      const order = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [
          {
            menuItemId: variantLatteAId,
            qty: 1,
            options: [
              { variantName: "Temperature", optionName: "Hot" },
              { variantName: "Sugar", optionName: "Normal Sugar" },
            ],
          },
          {
            menuItemId: variantLatteAId,
            qty: 1,
            options: [
              { variantName: "Temperature", optionName: "Cold" },
              { variantName: "Sugar", optionName: "Less Sugar" },
            ],
          },
        ],
        discountEligible: false,
      });
      expect(order.subtotalRupiah).toBe(47000); // 22000 (Hot) + 25000 (Cold +3000)
      const items = await testDb
        .select()
        .from(cafeOrderItems)
        .where(eq(cafeOrderItems.orderId, order.id));
      expect(items).toHaveLength(2);
      expect(items.filter((i) => i.menuItemId === variantLatteAId)).toHaveLength(2);
      const temps = items
        .map((i) => (i.variantOptions as { variantName: string; optionName: string }[]).find((o) => o.variantName === "Temperature")?.optionName)
        .sort();
      expect(temps).toEqual(["Cold", "Hot"]);
      // Legacy compatibility columns are never populated by new writes (NFR-044-04)
      expect(items.every((i) => i.temperature === null && i.sugar === null)).toBe(true);
    });

    it("AC-707: a variant order line snapshots group/option/adjustment in variant_options", async () => {
      const order = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [
          {
            menuItemId: variantLatteAId,
            qty: 1,
            options: [
              { variantName: "Temperature", optionName: "Cold" },
              { variantName: "Sugar", optionName: "No Sugar" },
            ],
          },
        ],
        discountEligible: false,
      });
      const [item] = await testDb
        .select()
        .from(cafeOrderItems)
        .where(eq(cafeOrderItems.orderId, order.id));
      expect(item.unitPriceRupiah).toBe(25000); // 22000 + 3000
      expect(item.variantOptions).toEqual([
        { variantName: "Temperature", optionName: "Cold", priceAdjustmentRupiah: 3000 },
        { variantName: "Sugar", optionName: "No Sugar", priceAdjustmentRupiah: 0 },
      ]);
    });

    it("AC-708: a later menu rename/reprice does not alter a prior order's line snapshots", async () => {
      const order = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      const [before] = await testDb
        .select()
        .from(cafeOrderItems)
        .where(eq(cafeOrderItems.orderId, order.id));
      expect(before.nameSnapshot).toBe("Latte");
      expect(before.unitPriceRupiah).toBe(32000);

      // Rename + reprice the live menu row after the order was placed
      await testDb
        .update(cafeMenuItems)
        .set({ name: "Latte Deluxe", priceRupiah: 99000 })
        .where(eq(cafeMenuItems.id, latteAId));

      const [after] = await testDb
        .select()
        .from(cafeOrderItems)
        .where(eq(cafeOrderItems.orderId, order.id));
      expect(after.nameSnapshot).toBe("Latte");
      expect(after.unitPriceRupiah).toBe(32000);

      // Restore for subsequent tests in this file
      await testDb
        .update(cafeMenuItems)
        .set({ name: "Latte", priceRupiah: 32000 })
        .where(eq(cafeMenuItems.id, latteAId));
    });

    it("AC-705: a missing required variant group is rejected, no write", async () => {
      const [{ count: before }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      await expect(
        createOrder({
          orgId: orgAId,
          customerUserId: aUserId,
          guestName: null,
          lines: [
            {
              menuItemId: variantLatteAId,
              qty: 1,
              options: [{ variantName: "Temperature", optionName: "Hot" }], // Sugar omitted
            },
          ],
          discountEligible: false,
        }),
      ).rejects.toThrow(/MISSING_REQUIRED_VARIANT/);
      const [{ count: after }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });

    it("AC-712: order notes are trimmed and persisted; blank notes store null", async () => {
      const withNotes = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
        notes: "  less sugar please  ",
      });
      expect(withNotes.notes).toBe("less sugar please");

      const withBlank = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
        notes: "   ",
      });
      expect(withBlank.notes).toBeNull();

      const [{ count: before }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      await expect(
        createOrder({
          orgId: orgAId,
          customerUserId: aUserId,
          guestName: null,
          lines: [{ menuItemId: latteAId, qty: 1 }],
          discountEligible: false,
          notes: "a".repeat(501),
        }),
      ).rejects.toThrow(/INVALID_NOTES/);
      const [{ count: after }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });

    it("AC-728: retries within the bounded code-generation policy after a collision, never duplicate org codes", async () => {
      const existing = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      mockedGenerateOrderCode
        .mockReturnValueOnce(existing.code) // forces a unique-violation on attempt 1
        .mockReturnValueOnce("zzz999"); // attempt 2 succeeds with a fresh code

      const second = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      expect(second.code).toBe("zzz999");
      expect(second.code).not.toBe(existing.code);
    });

    it("AC-112: createOrder rejects a non-positive / fractional qty (no total manipulation), no write", async () => {
      const [{ count: before }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      for (const badQty of [-1, 0, 1.5, 100, 3_000_000_000]) {
        await expect(
          createOrder({
            orgId: orgAId,
            customerUserId: aUserId,
            guestName: null,
            lines: [{ menuItemId: latteAId, qty: badQty }],
            discountEligible: false,
          }),
        ).rejects.toThrow(/INVALID_QUANTITY/);
      }
      const [{ count: after }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });

    it("[MONEY/DoS]: an order exceeding the 50-distinct-line cap is rejected before any write", async () => {
      const [{ count: before }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      const floodLines = Array.from({ length: 51 }, () => ({
        menuItemId: latteAId,
        qty: 1,
      }));
      await expect(
        createOrder({
          orgId: orgAId,
          customerUserId: aUserId,
          guestName: null,
          lines: floodLines,
          discountEligible: false,
        }),
      ).rejects.toThrow(/TOO_MANY_LINES/);
      const [{ count: after }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });

    it("AC-112 / AC-727: createOrder rejects an unavailable or archived item (orderability enforced), no write", async () => {
      // Capture the seeded non-orderable item ids.
      const seeded = await testDb
        .select()
        .from(cafeMenuItems)
        .where(eq(cafeMenuItems.orgId, orgAId));
      const hidden = seeded.find((i) => i.name === "HiddenItem")!; // available:false
      const archived = seeded.find((i) => i.name === "ArchivedItem")!; // archivedAt set
      const [{ count: before }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      for (const badId of [hidden.id, archived.id]) {
        await expect(
          createOrder({
            orgId: orgAId,
            customerUserId: aUserId,
            guestName: null,
            lines: [{ menuItemId: badId, qty: 1 }],
            discountEligible: false,
          }),
        ).rejects.toThrow(/INVALID_MENU_ITEMS/);
      }
      const [{ count: after }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });

    it("AC-125: createOrder rejects a menuItemId from another org (no cross-org pricing)", async () => {
      await expect(
        createOrder({
          orgId: orgAId,
          customerUserId: aUserId,
          guestName: null,
          lines: [{ menuItemId: orgBItemId, qty: 1 }],
          discountEligible: false,
        }),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // C3 — createOrder (guest path + zero-line rejection)
  // -------------------------------------------------------------------------
  describe("createOrder — guest + empty lines", () => {
    it("AC-113 / AC-723: guest order captures name, no discount, customerUserId null", async () => {
      const o = await createOrder({
        orgId: orgAId,
        customerUserId: null,
        guestName: "Sari",
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      expect(o.guestName).toBe("Sari");
      expect(o.customerUserId).toBeNull();
      expect(o.discountRupiah).toBe(0);
      expect(o.totalRupiah).toBe(o.subtotalRupiah);
      expect(o.status).toBe("NEW");
    });

    it("AC-114: order with zero valid lines is rejected, no write", async () => {
      const [{ count: before }] =
        await testSql`select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      await expect(
        createOrder({
          orgId: orgAId,
          customerUserId: null,
          guestName: "X",
          lines: [],
          discountEligible: false,
        }),
      ).rejects.toThrow();
      const [{ count: after }] =
        await testSql`select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      expect(after).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // C4 — advanceOrderStatus
  // -------------------------------------------------------------------------
  describe("advanceOrderStatus", () => {
    it("AC-122 / AC-724: advanceOrderStatus walks NEW→PREPARING→READY→COMPLETED then rejects a 4th call", async () => {
      const o = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("PREPARING");
      expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("READY");
      expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("COMPLETED");
      await expect(advanceOrderStatus(orgAId, o.id)).rejects.toThrow();
    });

    it("AC-124: advanceOrderStatus on a cross-org order forbids (lookup null), no write", async () => {
      const oB = await createOrder({
        orgId: orgBId,
        customerUserId: bUserId,
        guestName: null,
        lines: [{ menuItemId: orgBItemId, qty: 1 }],
        discountEligible: false,
      });
      await expect(advanceOrderStatus(orgAId, oB.id)).rejects.toThrow();
      const [fresh] = await testDb
        .select()
        .from(cafeOrders)
        .where(eq(cafeOrders.id, oB.id));
      expect(fresh.status).toBe("NEW");
    });
  });

  // -------------------------------------------------------------------------
  // D2 — AC-123 integration no-write proof
  // -------------------------------------------------------------------------
  describe("advanceOrderStatusAsActor — role gate", () => {
    it("AC-123: a MEMBER-role actor cannot advance status — server-side deny, no write", async () => {
      const o = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      await expect(
        advanceOrderStatusAsActor(
          { id: aUserId, role: "MEMBER", orgId: orgAId },
          o.id,
        ),
      ).rejects.toThrow(/FORBIDDEN/);
      const [fresh] = await testDb
        .select()
        .from(cafeOrders)
        .where(eq(cafeOrders.id, o.id));
      expect(fresh.status).toBe("NEW");
    });
  });

  // -------------------------------------------------------------------------
  // C5 — listOrders / getOrder / setOrderStatus
  // -------------------------------------------------------------------------
  describe("listOrders / getOrder / setOrderStatus", () => {
    it("AC-125: listOrders returns only the caller org's orders, newest first, with items + customer", async () => {
      const aOrders = await listOrders(orgAId);
      expect(aOrders.every((o) => o.orgId === orgAId)).toBe(true);
      // Each order must have items array
      expect(Array.isArray(aOrders[0]?.items)).toBe(true);
      // org B orders must not appear
      const ids = aOrders.map((o) => o.orgId);
      expect(ids.every((id) => id === orgAId)).toBe(true);
    });

    it("AC-125: listOrders attaches customer name+email when a member placed the order", async () => {
      const aOrders = await listOrders(orgAId);
      // At least one order has a member customer (from AC-112 test)
      const withCustomer = aOrders.find((o) => o.customerUserId !== null);
      expect(withCustomer).toBeDefined();
      expect(withCustomer?.customer?.name).toBe("Alice");
      expect(withCustomer?.customer?.email).toBe("cafe-a@x.test");
      // customer object must only have id, name, email — no credential columns
      if (withCustomer?.customer) {
        const keys = Object.keys(withCustomer.customer);
        expect(keys).toContain("id");
        expect(keys).toContain("name");
        expect(keys).toContain("email");
        expect(keys).not.toContain("password");
        expect(keys).not.toContain("passwordHash");
      }
    });

    it("listOrders filters by status set (KDS reads NEW/PREPARING/READY)", async () => {
      const kds = await listOrders(orgAId, {
        statuses: ["NEW", "PREPARING", "READY"],
      });
      expect(kds.every((o) => ["NEW", "PREPARING", "READY"].includes(o.status))).toBe(true);
    });

    it("AC-125: getOrder returns a single order with items + customer, org-scoped", async () => {
      const aOrders = await listOrders(orgAId);
      const first = aOrders[0];
      expect(first).toBeDefined();
      const fetched = await getOrder(orgAId, first!.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(first!.id);
      expect(Array.isArray(fetched?.items)).toBe(true);
      // Cross-org: getOrder with orgB should return null
      const crossOrg = await getOrder(orgBId, first!.id);
      expect(crossOrg).toBeNull();
    });

    it("AC-125: setOrderStatus allows admin free-set to any status, org-scoped", async () => {
      // Create a new order to mutate
      const o = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      const updated = await setOrderStatus(orgAId, o.id, "CANCELLED");
      expect(updated.status).toBe("CANCELLED");
      // Cross-org must throw
      await expect(setOrderStatus(orgBId, o.id, "COMPLETED")).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // C6 — listRecentOrdersByUser (I-049)
  // -------------------------------------------------------------------------
  describe("listRecentOrdersByUser", () => {
    it("returns only the caller's own org+user orders, newest first, capped at the limit, with status+items+total", async () => {
      // A second member in org A — their orders must never leak into aUserId's list.
      const [otherA] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: "cafe-a2@x.test", name: "Alice Two", role: "MEMBER" })
        .returning();

      const placed: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        const o = await createOrder({
          orgId: orgAId,
          customerUserId: aUserId,
          guestName: null,
          lines: [{ menuItemId: latteAId, qty: 1 }],
          discountEligible: false,
        });
        placed.push(o.id);
      }
      // Noise: another org-A member's order, and org B's own order.
      await createOrder({
        orgId: orgAId,
        customerUserId: otherA.id,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      await createOrder({
        orgId: orgBId,
        customerUserId: bUserId,
        guestName: null,
        lines: [{ menuItemId: orgBItemId, qty: 1 }],
        discountEligible: false,
      });

      const recent = await listRecentOrdersByUser(orgAId, aUserId, 5);

      expect(recent).toHaveLength(5);
      expect(recent.every((o) => o.customerUserId === aUserId)).toBe(true);
      expect(recent.every((o) => o.orgId === orgAId)).toBe(true);
      // every returned id was placed by aUserId (never otherA's or org B's order)
      expect(recent.every((o) => placed.includes(o.id))).toBe(true);
      // newest first — each row's createdAt is never older than the next
      for (let i = 1; i < recent.length; i += 1) {
        expect(recent[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          recent[i]!.createdAt.getTime(),
        );
      }
      // capped at 5 — the 2 oldest of the 7 placed orders are excluded
      const excludedIds = placed.slice(0, 2);
      expect(recent.map((o) => o.id)).not.toEqual(
        expect.arrayContaining(excludedIds),
      );
      // status + items + total are present on every row
      for (const o of recent) {
        expect(typeof o.status).toBe("string");
        expect(Array.isArray(o.items)).toBe(true);
        expect(o.items.length).toBeGreaterThan(0);
        expect(typeof o.totalRupiah).toBe("number");
      }
    });

    it("returns an empty array for a user with no orders", async () => {
      const [lonely] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: "cafe-lonely@x.test", name: "Lonely", role: "MEMBER" })
        .returning();
      const recent = await listRecentOrdersByUser(orgAId, lonely.id);
      expect(recent).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // DB CHECK constraint — cafe_menu_items.price_rupiah >= 0 [MONEY]
  // -------------------------------------------------------------------------
  describe("cafe_menu_items price_rupiah CHECK constraint [MONEY]", () => {
    it("rejects a direct write of a negative base price at the DB level (defence-in-depth)", async () => {
      await expect(
        testSql`
          insert into cafe_menu_items
            (id, org_id, name, emoji, category, price_rupiah, description, has_variants, available)
          values
            (gen_random_uuid()::text, ${orgAId}, 'Negative Item', '❌', 'SNACK', -1, 'x', false, true)
        `,
      ).rejects.toThrow();
    });

    it("accepts a zero base price (free item) — only negative is rejected", async () => {
      const [row] = await testSql`
        insert into cafe_menu_items
          (id, org_id, name, emoji, category, price_rupiah, description, has_variants, available)
        values
          (gen_random_uuid()::text, ${orgAId}, 'Free Item', '🆓', 'SNACK', 0, 'x', false, true)
        returning id
      `;
      expect(row.id).toBeDefined();
      await testSql`delete from cafe_menu_items where id = ${row.id}`;
    });
  });
});
