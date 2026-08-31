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
  type CafeMenuItem,
  type CafeOrder,
  type CafeOrderItem,
} from "@/lib/db/schema";
import { findProfilesByIds } from "@/lib/db/users";
import { getActiveBookingForUpdate } from "@/lib/db/bookings";
import { getTierDiscounts } from "@/lib/db/tier-config";
import { computeOrderTotals, priceOrderLines } from "@/lib/cafe/pricing";
import {
  normalizeOrderNotes,
  assertOrderLineQuantity,
  assertOrderLineCount,
} from "@/lib/cafe/validation";
import { recordTransaction } from "@/lib/db/transactions";
import { lockUserRowForCreditWrite } from "@/lib/db/time-credit-lots";
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
 * - Variant selections are validated against each item's LIVE `variant_config`
 *   and priced server-side (base + validated adjustment); no client price/
 *   adjustment is ever trusted (I-044, FR-721/722, [SEC] money-integrity fix).
 *
 * AC-107, AC-112, AC-113, AC-114, AC-125, AC-707, AC-708, AC-709, AC-727 / FR-111–115, FR-720–723.
 */
export async function createOrder(input: {
  orgId: string;
  customerUserId: string | null;
  guestName: string | null;
  lines: OrderLineInput[];
  discountEligible: boolean;
  notes?: string | null;
}): Promise<CafeOrder> {
  const { orgId, customerUserId, guestName, lines, discountEligible } = input;

  // Guard: reject empty lines BEFORE any DB access
  if (!lines.length) throw new Error("EMPTY_ORDER");

  // Guard: cap distinct lines BEFORE any DB access — a bot/script flooding
  // thousands of qty:1 lines (bypassing the client's cart-merge UI entirely,
  // since this is a server action) must be rejected up front, on every order
  // path (member/guest/POS share this one boundary) ([MONEY]/DoS).
  assertOrderLineCount(lines);

  // Guard: every line qty must be a positive integer within a sane bound. qty is
  // client-supplied and is multiplied into the server-computed total — a negative/
  // zero/fractional qty would manipulate the bill, and an enormous qty overflows
  // int4 (price × qty). Reject the whole order before any write ([SEC]).
  for (const l of lines) assertOrderLineQuantity(l.qty);

  // Guard: normalize/validate notes BEFORE any DB access (trim, blank→null,
  // 500 Unicode-code-point cap → INVALID_NOTES). The DB CHECK repeats this as
  // a defence-in-depth backstop, not the primary gate.
  const normalizedNotes = normalizeOrderNotes(input.notes);

  // Look up each requested item within this org only (cross-org guard [SEC]).
  // Validate against DISTINCT ids: a single item may appear on multiple lines
  // (e.g. the same drink ordered in two variants — hot + cold), so comparing
  // raw line count would falsely reject a legitimate multi-variant order.
  const uniqueIds = [...new Set(lines.map((l) => l.menuItemId))];
  const foundItems = await db
    .select()
    .from(cafeMenuItems)
    .where(
      and(
        eq(cafeMenuItems.orgId, orgId),
        inArray(cafeMenuItems.id, uniqueIds),
        // Only orderable items: the venue's availability/archive contract is
        // enforced server-side, not just hidden in listMenu ([SEC] business
        // integrity — a captured id must not order a sold-out/archived item).
        eq(cafeMenuItems.available, true),
        isNull(cafeMenuItems.archivedAt),
      ),
    );

  // Reject if any line refers to an item that is unknown, cross-org, or unorderable
  if (foundItems.length !== uniqueIds.length) {
    throw new Error("INVALID_MENU_ITEMS");
  }

  // Price each line against the LIVE looked-up rows: validates every selected
  // variant group/option (rejects unknown/missing-required/hasVariants=false
  // selections) and computes unitPriceRupiah = base + validated adjustments.
  // Snapshots (name, price, options) are taken here so a later menu edit can
  // never alter a persisted order (FR-723, AC-708).
  const pricedLines = priceOrderLines(foundItems, lines);

  // Bounded retry on unique code collision (ADR-0012)
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateOrderCode();
    try {
      const order = await db.transaction(async (tx) => {
        // Resolve the discount % server-side, INSIDE this transaction, right
        // before the write: `discountEligible` from the caller is only a
        // precondition (e.g. "this session's role qualifies") — it is NEVER
        // trusted as the final eligibility decision. The live ACTIVE-booking
        // check is re-run here (against `tx`, ROW-LOCKED via `FOR UPDATE`,
        // not a value resolved earlier in the request) so a concurrent
        // cancel cannot land between the recheck and this write — it blocks
        // on the lock until this transaction commits or rolls back ([MONEY]
        // TOCTOU fix, AC-115, fix round 2 item 2: a plain re-check alone
        // still left an unlocked window). Guests / ineligible / unconfigured
        // → 0% (fail-safe). [SEC] never trust a client rate.
        let discountPct = 0;
        if (discountEligible && customerUserId) {
          const activeBooking = await getActiveBookingForUpdate(orgId, customerUserId, tx);
          if (activeBooking) {
            // [SEC][POOL] Both calls below pass `tx` — the SAME connection
            // this transaction already holds. Defaulting to the global `db`
            // here would check out a SECOND pooled connection while this
            // transaction's own connection is still held, the exact
            // pool-exhaustion deadlock class `getTierDiscounts` is already
            // documented against (I-040; I-044 fix round 2, item 3).
            const [profile] = await findProfilesByIds(orgId, [customerUserId], tx);
            if (profile) {
              discountPct = (await getTierDiscounts(orgId, profile.membershipTier, tx))
                .cafeDiscountPct;
            }
          }
        }

        // [SEC][MONEY][I-047 fix round 3] Canonical first app_users lock
        // (member path): BEFORE any app_users-FK insert below (cafe_orders.
        // customer_user_id, transactions.user_id), take the member's row FOR
        // NO KEY UPDATE — the inserts' implicit FOR KEY SHARE subsumes into
        // it. Today this path spends no credits, but the moment one does,
        // an insert-then-strong-lock order would reintroduce the finding-4
        // KEY SHARE → strong-lock upgrade deadlock (proven by the barrier
        // tests in lib/db/credit-lock-order.int.test.ts). Position matters:
        // when the discount path locked the member's ACTIVE booking (B) via
        // getActiveBookingForUpdate above, B came FIRST — the same
        // B → app_users order as checkoutBooking/extendBooking, so no
        // cross-object pair inverts. Guest orders (no customer_user_id)
        // have nothing to lock and skip this. A cross-org/nonexistent id
        // locks nothing and still fails on the FK insert, as before.
        if (customerUserId) {
          await lockUserRowForCreditWrite(tx, orgId, customerUserId);
        }

        const totals = computeOrderTotals(pricedLines, { discountPct });

        const [newOrder] = await tx
          .insert(cafeOrders)
          .values({
            orgId,
            code,
            customerUserId,
            guestName,
            notes: normalizedNotes,
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
            // Legacy compatibility columns — new writes never populate them
            // (NFR-044-04); the canonical shape is variantOptions.
            temperature: null,
            sugar: null,
            variantOptions: pl.variantOptions,
          })),
        );

        // Ledger row so the order appears in member /history + admin revenue.
        await recordTransaction(
          {
            orgId,
            userId: customerUserId,
            type: "CAFE_ORDER",
            description: guestName
              ? `Pesanan Cafe (tamu: ${guestName})`
              : "Pesanan Cafe",
            amountRupiah: totals.totalRupiah,
            discountRupiah: totals.discountRupiah,
            cafeOrderId: newOrder.id,
          },
          tx,
        );

        return newOrder;
      });
      return order;
    } catch (err) {
      // Detect unique-violation on (org_id, code) — Postgres error code 23505.
      // Drizzle wraps the driver error (`DrizzleQueryError`), putting the real
      // PostgresError on `.cause` — check both the outer error AND `.cause` so
      // this retry actually fires regardless of wrapper shape ([SEC] a silent
      // rethrow here would surface a spurious 500 on a benign code collision
      // instead of retrying, AC-728).
      const pgErr = err as {
        code?: string;
        message?: string;
        cause?: { code?: string; message?: string };
      };
      const code = pgErr.code ?? pgErr.cause?.code;
      const message = pgErr.message ?? pgErr.cause?.message ?? "";
      const isUniqueViolation =
        code === "23505" || message.includes("cafe_orders_org_id_code_key");
      if (!isUniqueViolation) throw err;
      if (attempt === MAX_RETRIES - 1) throw new Error("CODE_GENERATION_FAILED");
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

  // Compare-and-set on the status we read: if a concurrent actor (two baristas,
  // a double-click, or a Realtime-driven re-render) already advanced this order,
  // the WHERE matches 0 rows and we reject rather than silently overwriting a
  // newer state with a stale forward step (lost-update guard).
  const [updated] = await db
    .update(cafeOrders)
    .set({ status: next, updatedAt: new Date() })
    .where(
      and(
        eq(cafeOrders.id, id),
        eq(cafeOrders.orgId, orgId),
        eq(cafeOrders.status, order.status),
      ),
    )
    .returning();

  if (!updated) throw new Error("INVALID_TRANSITION");
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
  orgId: string,
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
  // Delegate to the shared org-scoped profile lookup (findProfilesByIds already
  // enforces orgId isolation; cross-org customerUserId never hydrates another org's
  // name/email). We keep only { id, name, email } from the returned rows.
  const profileRows = await findProfilesByIds(orgId, customerIds);
  const customers: { id: string; name: string; email: string }[] = profileRows.map(
    ({ id, name, email }) => ({ id, name, email }),
  );

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

  return attachRelations(orgId, rows);
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

  const [withRelations] = await attachRelations(orgId, [order]);
  return withRelations ?? null;
}

/**
 * Org + user scoped recent orders (member "Pesanan Terakhir" card), newest
 * first, capped at `limit`. Never another member's or another org's orders
 * ([SEC] — both orgId and customerUserId are part of the WHERE, and both are
 * always server-derived, never client-supplied).
 */
export async function listRecentOrdersByUser(
  orgId: string,
  userId: string,
  limit = 5,
): Promise<CafeOrderWithRelations[]> {
  const rows = await db
    .select()
    .from(cafeOrders)
    .where(and(eq(cafeOrders.orgId, orgId), eq(cafeOrders.customerUserId, userId)))
    .orderBy(desc(cafeOrders.createdAt))
    .limit(limit);

  return attachRelations(orgId, rows);
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
