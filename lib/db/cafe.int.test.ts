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
} from "@/lib/db/cafe";
import { advanceOrderStatusAsActor } from "@/lib/cafe/authz";
import { generateOrderCode } from "@/lib/cafe/status";

const mockedGenerateOrderCode = generateOrderCode as unknown as ReturnType<typeof vi.fn>;

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
});
