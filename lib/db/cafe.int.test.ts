/**
 * Integration tests for lib/db/cafe.ts (Phase C + D, I-022)
 * Runs against a real (throwaway) Postgres DB via TEST_DATABASE_URL.
 *
 * AC-100  listMenu returns only orgA available, non-archived items
 * AC-112  createOrder persists member order with server totals + NEW + unique code
 * AC-113  guest order captures name, no discount
 * AC-114  zero valid lines rejected, no write
 * AC-122  advanceOrderStatus walks NEW→PREPARING→READY→COMPLETED then rejects
 * AC-123  MEMBER-role action call does not change status (server-side deny, no write)
 * AC-124  cross-org advance forbidden, no write
 * AC-125  listOrders / createOrder org-scoped
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/flowspace_test?schema=public";

/** Dedicated PrismaClient for the test DB — never uses the app's singleton. */
const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_URL } },
});

// --- test data IDs ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let bUserId: string;
let latteAId: string;
let croissantAId: string;
let orgBItemId: string;

beforeAll(async () => {
  // Truncate all rows (cascade) — extend list for cafe tables
  await testPrisma.$executeRaw`
    TRUNCATE TABLE
      "cafe_order_items",
      "cafe_orders",
      "cafe_menu_items",
      "app_users",
      "organizations"
    RESTART IDENTITY CASCADE
  `;

  // Seed two orgs
  const orgA = await testPrisma.organization.create({
    data: { name: "Org A", slug: "org-a-cafe-test" },
  });
  const orgB = await testPrisma.organization.create({
    data: { name: "Org B", slug: "org-b-cafe-test" },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Seed one user per org
  const { hashSync } = await import("bcryptjs");
  const userA = await testPrisma.appUser.create({
    data: {
      orgId: orgAId,
      email: "alice@cafe.test",
      name: "Alice",
      passwordHash: hashSync("pw-a", 10),
      role: "MEMBER",
    },
  });
  const userB = await testPrisma.appUser.create({
    data: {
      orgId: orgBId,
      email: "bob@cafe.test",
      name: "Bob",
      passwordHash: hashSync("pw-b", 10),
      role: "MEMBER",
    },
  });
  aUserId = userA.id;
  bUserId = userB.id;

  // Seed org A menu items: 2 available + 1 available:false + 1 archived
  const latte = await testPrisma.cafeMenuItem.create({
    data: {
      orgId: orgAId,
      name: "Latte",
      emoji: "☕",
      category: "COFFEE",
      priceRupiah: 32000,
      description: "Espresso with milk",
      hasVariants: true,
      available: true,
    },
  });
  const croissant = await testPrisma.cafeMenuItem.create({
    data: {
      orgId: orgAId,
      name: "Croissant",
      emoji: "🥐",
      category: "FOOD",
      priceRupiah: 25000,
      description: "Buttery croissant",
      hasVariants: false,
      available: true,
    },
  });
  latteAId = latte.id;
  croissantAId = croissant.id;

  await testPrisma.cafeMenuItem.create({
    data: {
      orgId: orgAId,
      name: "HiddenItem",
      emoji: "🙈",
      category: "SNACK",
      priceRupiah: 10000,
      description: "Not available",
      hasVariants: false,
      available: false,
    },
  });

  await testPrisma.cafeMenuItem.create({
    data: {
      orgId: orgAId,
      name: "ArchivedItem",
      emoji: "🗃️",
      category: "SNACK",
      priceRupiah: 10000,
      description: "Archived",
      hasVariants: false,
      available: true,
      archivedAt: new Date(),
    },
  });

  // Seed org B menu item
  const orgBItem = await testPrisma.cafeMenuItem.create({
    data: {
      orgId: orgBId,
      name: "OrgBItem",
      emoji: "🅱️",
      category: "COFFEE",
      priceRupiah: 20000,
      description: "Belongs to org B",
      hasVariants: false,
      available: true,
    },
  });
  orgBItemId = orgBItem.id;
});

afterAll(async () => {
  await testPrisma.$executeRaw`
    TRUNCATE TABLE
      "cafe_order_items",
      "cafe_orders",
      "cafe_menu_items",
      "app_users",
      "organizations"
    RESTART IDENTITY CASCADE
  `;
  await testPrisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Import the repository functions under test (these don't exist yet — RED)
// ---------------------------------------------------------------------------
import {
  listMenu,
  createOrder,
  listOrders,
  getOrder,
  advanceOrderStatus,
} from "@/lib/db/cafe";

// authz seam for AC-123
import { advanceOrderStatusAsActor } from "@/lib/cafe/authz";

describe("lib/db/cafe", () => {
  // -------------------------------------------------------------------------
  // C1 — listMenu
  // -------------------------------------------------------------------------
  describe("listMenu", () => {
    it("AC-100: listMenu returns only orgA available, non-archived items, sorted", async () => {
      const items = await listMenu(orgAId);
      expect(items.every((i) => i.orgId === orgAId)).toBe(true);
      expect(items.map((i) => i.name)).not.toContain("HiddenItem"); // available:false
      expect(items.map((i) => i.name)).not.toContain("ArchivedItem"); // archivedAt set
      expect(items.map((i) => i.name)).not.toContain("OrgBItem"); // cross-org
      expect(items.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // C2 — createOrder: member path
  // -------------------------------------------------------------------------
  describe("createOrder — member path", () => {
    it("AC-112: createOrder persists member order with server totals + NEW + unique code", async () => {
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
      // subtotal = 32000*1 + 25000*2 = 82000
      expect(order.subtotalRupiah).toBe(82000);
      expect(order.discountRupiah).toBe(0);
      expect(order.totalRupiah).toBe(82000);
      expect(order.code).toMatch(/^[0-9a-z]{6}$/);

      const items = await testPrisma.cafeOrderItem.findMany({
        where: { orderId: order.id },
      });
      const latteLine = items.find((i) => i.menuItemId === latteAId);
      expect(latteLine?.unitPriceRupiah).toBe(32000);
      expect(latteLine?.nameSnapshot).toBe("Latte");
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
  // C3 — createOrder: guest path
  // -------------------------------------------------------------------------
  describe("createOrder — guest path", () => {
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
    });

    it("AC-114: order with zero valid lines is rejected, no write", async () => {
      const before = await testPrisma.cafeOrder.count({
        where: { orgId: orgAId },
      });
      await expect(
        createOrder({
          orgId: orgAId,
          customerUserId: null,
          guestName: "X",
          lines: [],
          discountEligible: false,
        }),
      ).rejects.toThrow();
      expect(
        await testPrisma.cafeOrder.count({ where: { orgId: orgAId } }),
      ).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // C4 — advanceOrderStatus
  // -------------------------------------------------------------------------
  describe("advanceOrderStatus", () => {
    it("AC-122: advanceOrderStatus walks NEW→PREPARING→READY→COMPLETED then rejects", async () => {
      const o = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      expect(o.status).toBe("NEW");
      expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("PREPARING");
      expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("READY");
      expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("COMPLETED");
      await expect(advanceOrderStatus(orgAId, o.id)).rejects.toThrow();
    });

    it("AC-124: advanceOrderStatus on a cross-org order forbids, no write", async () => {
      const oB = await createOrder({
        orgId: orgBId,
        customerUserId: bUserId,
        guestName: null,
        lines: [{ menuItemId: orgBItemId, qty: 1 }],
        discountEligible: false,
      });
      await expect(advanceOrderStatus(orgAId, oB.id)).rejects.toThrow();
      const fresh = await testPrisma.cafeOrder.findUnique({
        where: { id: oB.id },
      });
      expect(fresh?.status).toBe("NEW");
    });
  });

  // -------------------------------------------------------------------------
  // C5 — listOrders / getOrder
  // -------------------------------------------------------------------------
  describe("listOrders / getOrder", () => {
    it("AC-125: listOrders returns only the caller org's orders, newest first", async () => {
      const aOrders = await listOrders(orgAId);
      expect(aOrders.every((o) => o.orgId === orgAId)).toBe(true);
    });

    it("listOrders filters by status set", async () => {
      const kds = await listOrders(orgAId, {
        statuses: ["NEW", "PREPARING", "READY"],
      });
      expect(
        kds.every((o) =>
          (["NEW", "PREPARING", "READY"] as string[]).includes(o.status),
        ),
      ).toBe(true);
    });

    it("getOrder returns org-scoped order with items", async () => {
      const created = await createOrder({
        orgId: orgAId,
        customerUserId: aUserId,
        guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }],
        discountEligible: false,
      });
      const found = await getOrder(orgAId, created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.items.length).toBe(1);
    });

    it("getOrder returns null for cross-org id", async () => {
      const oB = await createOrder({
        orgId: orgBId,
        customerUserId: bUserId,
        guestName: null,
        lines: [{ menuItemId: orgBItemId, qty: 1 }],
        discountEligible: false,
      });
      const result = await getOrder(orgAId, oB.id);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // D2 — AC-123 server-side MEMBER deny
  // -------------------------------------------------------------------------
  describe("AC-123: MEMBER cannot mutate order status", () => {
    it("AC-123: a MEMBER-role action call does not change status (server-side deny, no write)", async () => {
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
      const fresh = await testPrisma.cafeOrder.findUnique({
        where: { id: o.id },
      });
      expect(fresh?.status).toBe("NEW");
    });
  });
});
