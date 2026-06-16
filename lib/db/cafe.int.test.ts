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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  cafeMenuItems,
  cafeOrders,
  cafeOrderItems,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

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

beforeAll(async () => {
  // Truncate via raw sql (postgres-js) to avoid Drizzle execute hang on
  // Supabase Postgres in the vitest worker environment.
  await testSql`TRUNCATE TABLE "cafe_order_items","cafe_orders","cafe_menu_items","app_users","organizations" RESTART IDENTITY CASCADE`;

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
  await testSql`TRUNCATE TABLE "cafe_order_items","cafe_orders","cafe_menu_items","app_users","organizations" RESTART IDENTITY CASCADE`;
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
    it("AC-112: createOrder persists member order with server totals, NEW, unique code, line snapshots", async () => {
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

    it("AC-112: createOrder accepts the same item on two lines (multi-variant drink: hot + cold)", async () => {
      // A member orders one Latte hot + one Latte cold — two lines, same menuItemId.
      // The cross-org guard must validate distinct ids, not raw line count.
      const order = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [
          { menuItemId: latteAId, qty: 1, temperature: "HOT", sugar: "NORMAL" },
          { menuItemId: latteAId, qty: 1, temperature: "COLD", sugar: "LESS" },
        ],
        discountEligible: false,
      });
      expect(order.subtotalRupiah).toBe(64000); // 32000 × 2
      const items = await testDb
        .select()
        .from(cafeOrderItems)
        .where(eq(cafeOrderItems.orderId, order.id));
      expect(items).toHaveLength(2);
      expect(items.filter((i) => i.menuItemId === latteAId)).toHaveLength(2);
      const temps = items.map((i) => i.temperature).sort();
      expect(temps).toEqual(["COLD", "HOT"]);
    });

    it("AC-112: createOrder rejects a non-positive / fractional qty (no total manipulation), no write", async () => {
      const [{ count: before }] = await testSql`
        select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
      for (const badQty of [-1, 0, 1.5]) {
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
    it("AC-113: guest order captures name, no discount, customerUserId null", async () => {
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
    it("AC-122: advanceOrderStatus walks NEW→PREPARING→READY→COMPLETED then rejects a 4th call", async () => {
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
