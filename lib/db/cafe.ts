/**
 * Repository: CafeMenuItem / CafeOrder / CafeOrderItem
 *
 * All reads/writes are server-side via Drizzle over Supabase Postgres (ADR-0015).
 * Every org-scoped function takes `orgId` derived from the server session —
 * the client NEVER supplies it (ADR-0004).
 *
 * Totals are ALWAYS server-computed from the org's live menu prices;
 * never trust any client-supplied price/total (FR-111, [SEC]).
 */
import { and, eq, isNull, asc, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  cafeMenuItems,
  cafeOrders,
  cafeOrderItems,
  appUsers,
  type CafeMenuItem,
  type CafeOrder,
  type CafeOrderItem,
} from "@/lib/db/schema";
import { computeOrderTotals } from "@/lib/cafe/pricing";
import { generateOrderCode, nextStatus } from "@/lib/cafe/status";
import type { CafeOrderStatus, OrderLineInput } from "@/lib/cafe/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CafeOrderWithRelations = CafeOrder & {
  items: CafeOrderItem[];
  customer: { id: string; name: string; email: string } | null;
};

// ---------------------------------------------------------------------------
// C1: listMenu
// ---------------------------------------------------------------------------

/**
 * Returns the available (non-archived) menu items for an org, sorted by
 * category then name. The caller's `orgId` is always server-derived.
 * AC-100 / FR-101, FR-103.
 */
export function listMenu(orgId: string): Promise<CafeMenuItem[]> {
  return db
    .select()
    .from(cafeMenuItems)
    .where(
      and(
        eq(cafeMenuItems.orgId, orgId),
        isNull(cafeMenuItems.archivedAt),
        eq(cafeMenuItems.available, true),
      ),
    )
    .orderBy(asc(cafeMenuItems.category), asc(cafeMenuItems.name));
}

// ---------------------------------------------------------------------------
// C2/C3: createOrder  [SEC] — server-priced single transaction
// ---------------------------------------------------------------------------

/**
 * Creates a new cafe order for a member or guest.
 *
 * Security contract:
 * - All item prices are looked up within the caller's `orgId`; any line with
 *   an unknown or cross-org menuItemId causes the entire call to throw BEFORE
 *   any write.
 * - Totals are computed server-side via computeOrderTotals; no client price/
 *   total is trusted.
 * - The order + items are inserted in a single DB transaction.
 * - On (org_id, code) unique violation the code is regenerated up to 5×;
 *   after 5 failures CODE_GENERATION_FAILED is thrown (ADR-0012).
 *
 * AC-112, AC-113, AC-114, AC-125 / FR-111–115.
 */
export async function createOrder(input: {
  orgId: string;
  customerUserId: string | null;
  guestName: string | null;
  lines: OrderLineInput[];
  discountEligible: boolean;
}): Promise<CafeOrder> {
  const { orgId, customerUserId, guestName, lines, discountEligible } = input;

  // Guard: reject empty lines BEFORE any DB access
  if (!lines.length) throw new Error("EMPTY_ORDER");

  // Guard: every line qty must be a positive integer. qty is client-supplied and
  // is multiplied into the server-computed total — a negative/zero/fractional qty
  // would manipulate the bill, so reject the whole order before any write ([SEC]).
  if (lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)) {
    throw new Error("INVALID_QUANTITY");
  }

  // Look up each requested item within this org only (cross-org guard [SEC]).
  // Validate against DISTINCT ids: a single item may appear on multiple lines
  // (e.g. the same drink ordered in two variants — hot + cold), so comparing
  // raw line count would falsely reject a legitimate multi-variant order.
  const uniqueIds = [...new Set(lines.map((l) => l.menuItemId))];
  const foundItems = await db
    .select()
    .from(cafeMenuItems)
    .where(
      and(eq(cafeMenuItems.orgId, orgId), inArray(cafeMenuItems.id, uniqueIds)),
    );

  // Reject if any line refers to an item that doesn't exist in this org
  if (foundItems.length !== uniqueIds.length) {
    throw new Error("INVALID_MENU_ITEMS");
  }

  // Build a price map keyed by id
  const priceMap = new Map(foundItems.map((i) => [i.id, i]));

  // Build priced lines (snapshot name + price from the looked-up DB row)
  const pricedLines = lines.map((l) => {
    const item = priceMap.get(l.menuItemId)!;
    return {
      menuItemId: l.menuItemId,
      nameSnapshot: item.name,
      qty: l.qty,
      unitPriceRupiah: item.priceRupiah,
      temperature: l.temperature ?? null,
      sugar: l.sugar ?? null,
    };
  });

  const totals = computeOrderTotals(pricedLines, { discountEligible });

  // Bounded retry on unique code collision (ADR-0012)
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateOrderCode();
    try {
      const order = await db.transaction(async (tx) => {
        const [newOrder] = await tx
          .insert(cafeOrders)
          .values({
            orgId,
            code,
            customerUserId,
            guestName,
            status: "NEW",
            subtotalRupiah: totals.subtotalRupiah,
            discountRupiah: totals.discountRupiah,
            totalRupiah: totals.totalRupiah,
          })
          .returning();

        await tx.insert(cafeOrderItems).values(
          pricedLines.map((pl) => ({
            orderId: newOrder.id,
            menuItemId: pl.menuItemId,
            nameSnapshot: pl.nameSnapshot,
            qty: pl.qty,
            unitPriceRupiah: pl.unitPriceRupiah,
            temperature: pl.temperature,
            sugar: pl.sugar,
          })),
        );

        return newOrder;
      });
      return order;
    } catch (err) {
      // Detect unique-violation on (org_id, code) — Postgres error code 23505
      const pgErr = err as { code?: string; message?: string };
      const isUniqueViolation =
        pgErr.code === "23505" ||
        (pgErr.message ?? "").includes("cafe_orders_org_id_code_key");
      if (!isUniqueViolation || attempt === MAX_RETRIES - 1) throw err;
      // else: retry with a new code
    }
  }

  throw new Error("CODE_GENERATION_FAILED");
}

// ---------------------------------------------------------------------------
// C4: advanceOrderStatus
// ---------------------------------------------------------------------------

/**
 * Advances an order one step in the forward lifecycle (NEW→PREPARING→READY→COMPLETED).
 * Throws NOT_FOUND for cross-org ids (org-scoped lookup). Throws INVALID_TRANSITION
 * when the current status is terminal (COMPLETED or CANCELLED).
 *
 * AC-122, AC-124 / FR-120, FR-121, FR-123.
 */
export async function advanceOrderStatus(
  orgId: string,
  id: string,
): Promise<CafeOrder> {
  const [order] = await db
    .select()
    .from(cafeOrders)
    .where(and(eq(cafeOrders.id, id), eq(cafeOrders.orgId, orgId)))
    .limit(1);

  if (!order) throw new Error("NOT_FOUND");

  const next = nextStatus(order.status);
  if (!next) throw new Error("INVALID_TRANSITION");

  const [updated] = await db
    .update(cafeOrders)
    .set({ status: next, updatedAt: new Date() })
    .where(and(eq(cafeOrders.id, id), eq(cafeOrders.orgId, orgId)))
    .returning();

  return updated;
}

// ---------------------------------------------------------------------------
// C5: listOrders / getOrder / setOrderStatus
// ---------------------------------------------------------------------------

/**
 * Attaches items + a minimal customer object to a set of orders.
 * Customer: only { id, name, email } — no credential columns exist on app_users,
 * but we select ONLY these three fields as a defence-in-depth [SEC].
 */
async function attachRelations(
  orders: CafeOrder[],
): Promise<CafeOrderWithRelations[]> {
  if (!orders.length) return [];

  const orderIds = orders.map((o) => o.id);
  const allItems = await db
    .select()
    .from(cafeOrderItems)
    .where(inArray(cafeOrderItems.orderId, orderIds));

  // Collect distinct customer user ids
  const customerIds = [
    ...new Set(orders.filter((o) => o.customerUserId).map((o) => o.customerUserId!)),
  ];
  const customers: { id: string; name: string; email: string }[] = customerIds.length
    ? await db
        .select({ id: appUsers.id, name: appUsers.name, email: appUsers.email })
        .from(appUsers)
        .where(inArray(appUsers.id, customerIds))
    : [];

  const itemsByOrder = new Map<string, CafeOrderItem[]>();
  for (const item of allItems) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return orders.map((o) => ({
    ...o,
    items: itemsByOrder.get(o.id) ?? [],
    customer: o.customerUserId ? (customerMap.get(o.customerUserId) ?? null) : null,
  }));
}

/**
 * Org-scoped list of orders, newest first, with items + customer.
 * Optionally filter by a set of statuses (for the KDS).
 *
 * AC-125 / FR-124, FR-130, FR-131.
 */
export async function listOrders(
  orgId: string,
  opts?: { statuses?: CafeOrderStatus[]; limit?: number },
): Promise<CafeOrderWithRelations[]> {
  const conditions = [eq(cafeOrders.orgId, orgId)];
  if (opts?.statuses?.length) {
    conditions.push(inArray(cafeOrders.status, opts.statuses));
  }

  const rows = await db
    .select()
    .from(cafeOrders)
    .where(and(...conditions))
    .orderBy(desc(cafeOrders.createdAt))
    .limit(opts?.limit ?? 200);

  return attachRelations(rows);
}

/**
 * Org-scoped lookup of a single order with items + customer.
 * Returns null for cross-org ids (never throws — callers decide how to handle).
 *
 * AC-125.
 */
export async function getOrder(
  orgId: string,
  id: string,
): Promise<CafeOrderWithRelations | null> {
  const [order] = await db
    .select()
    .from(cafeOrders)
    .where(and(eq(cafeOrders.id, id), eq(cafeOrders.orgId, orgId)))
    .limit(1);

  if (!order) return null;

  const [withRelations] = await attachRelations([order]);
  return withRelations ?? null;
}

/**
 * Admin free-set: update an order to any CafeOrderStatus (not forward-only).
 * Throws NOT_FOUND for cross-org ids.
 *
 * AC-125 / FR-124.
 */
export async function setOrderStatus(
  orgId: string,
  id: string,
  status: CafeOrderStatus,
): Promise<CafeOrder> {
  const [order] = await db
    .select()
    .from(cafeOrders)
    .where(and(eq(cafeOrders.id, id), eq(cafeOrders.orgId, orgId)))
    .limit(1);

  if (!order) throw new Error("NOT_FOUND");

  const [updated] = await db
    .update(cafeOrders)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(cafeOrders.id, id), eq(cafeOrders.orgId, orgId)))
    .returning();

  return updated;
}
