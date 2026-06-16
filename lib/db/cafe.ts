/**
 * Repository: Cafe domain (CafeMenuItem, CafeOrder, CafeOrderItem)
 *
 * All reads/writes are server-side and org-scoped. Every function that touches
 * org data takes `orgId` derived from the server session — the client NEVER
 * supplies it (ADR-0004). Totals are always computed server-side via
 * computeOrderTotals; client-supplied prices/totals are ignored (FR-111).
 */
import { prisma } from "@/lib/db/client";
import type { CafeOrderStatus } from "@prisma/client";
import { computeOrderTotals } from "@/lib/cafe/pricing";
import { generateOrderCode, nextStatus } from "@/lib/cafe/status";
import type { OrderLineInput } from "@/lib/cafe/types";

// ---------------------------------------------------------------------------
// Menu reads
// ---------------------------------------------------------------------------

/**
 * Returns the org's non-archived, available menu items ordered by category
 * then name. Never call with a client-supplied orgId.
 * FR-101 / AC-100
 */
export function listMenu(orgId: string) {
  return prisma.cafeMenuItem.findMany({
    where: { orgId, archivedAt: null, available: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

// ---------------------------------------------------------------------------
// Order reads
// ---------------------------------------------------------------------------

/**
 * Org-scoped order list, newest first.
 * Optionally filtered to a status subset (e.g. the KDS reads NEW/PREPARING/READY).
 * FR-130 / AC-125
 */
export function listOrders(
  orgId: string,
  opts?: { statuses?: CafeOrderStatus[]; limit?: number },
) {
  return prisma.cafeOrder.findMany({
    where: {
      orgId,
      ...(opts?.statuses ? { status: { in: opts.statuses } } : {}),
    },
    include: {
      items: true,
      // Include member identity for the admin order view — only safe fields;
      // passwordHash is never selected. Customer is always in the same org by FK.
      customer: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit,
  });
}

/**
 * Org-scoped single-order fetch with items.
 * Returns null for unknown id or cross-org id. FR-131
 */
export function getOrder(orgId: string, id: string) {
  return prisma.cafeOrder.findFirst({
    where: { id, orgId },
    include: {
      items: true,
      // Same safe field selection as listOrders — no passwordHash.
      customer: { select: { id: true, name: true, email: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Order creation
// ---------------------------------------------------------------------------

/**
 * Creates an order (and its items) in a single transaction.
 *
 * - Looks up each menu item **within orgId** — cross-org/unknown items cause an error.
 * - Snapshots name + price server-side.
 * - Computes totals server-side via computeOrderTotals (FR-111).
 * - Generates a unique-per-org code; retries up to 5× on collision (ADR-0012).
 * - Throws before any write if lines resolves to zero valid items (FR-114).
 *
 * FR-111, FR-112, FR-113, FR-114, FR-115 / AC-112, AC-113, AC-114, AC-125
 */
export async function createOrder(input: {
  orgId: string;
  customerUserId: string | null;
  guestName: string | null;
  lines: OrderLineInput[];
  discountEligible: boolean;
}) {
  const { orgId, customerUserId, guestName, lines, discountEligible } = input;

  // Guard: at least one line required before any DB read
  if (!lines || lines.length === 0) {
    throw new Error("EMPTY_ORDER");
  }

  // Look up every menu item scoped to this org (rejects cross-org or unknown IDs)
  const menuIds = lines.map((l) => l.menuItemId);
  const menuItems = await prisma.cafeMenuItem.findMany({
    where: { id: { in: menuIds }, orgId, available: true, archivedAt: null },
  });

  if (menuItems.length !== lines.length) {
    throw new Error("INVALID_MENU_ITEMS");
  }

  // Build priced lines (server-side price snapshot)
  const priceMap = new Map(menuItems.map((m) => [m.id, m]));
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

  // Compute totals server-side (FR-111)
  const totals = computeOrderTotals(pricedLines, { discountEligible });

  // Generate a unique-per-org code with retry on collision (ADR-0012)
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateOrderCode();
    try {
      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.cafeOrder.create({
          data: {
            orgId,
            code,
            customerUserId,
            guestName,
            status: "NEW",
            subtotalRupiah: totals.subtotalRupiah,
            discountRupiah: totals.discountRupiah,
            totalRupiah: totals.totalRupiah,
            items: {
              create: pricedLines.map((pl) => ({
                menuItemId: pl.menuItemId,
                nameSnapshot: pl.nameSnapshot,
                qty: pl.qty,
                unitPriceRupiah: pl.unitPriceRupiah,
                temperature: pl.temperature,
                sugar: pl.sugar,
              })),
            },
          },
        });
        return created;
      });
      return order;
    } catch (err) {
      // Prisma unique-constraint violation code: P2002
      const isUniqueViolation =
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "P2002";
      if (!isUniqueViolation || attempt === MAX_ATTEMPTS - 1) throw err;
      // Retry with a new code
    }
  }
  // TypeScript exhaustive: unreachable
  throw new Error("ORDER_CODE_EXHAUSTED");
}

// ---------------------------------------------------------------------------
// Order status mutations
// ---------------------------------------------------------------------------

/**
 * Advances the order one step along the forward lifecycle (NEW→PREPARING→READY→COMPLETED).
 * Throws if the order is not found in this org (cross-org protection) or if already terminal.
 * FR-120, FR-121, FR-123 / AC-122, AC-124
 */
export async function advanceOrderStatus(orgId: string, id: string) {
  const order = await prisma.cafeOrder.findFirst({ where: { id, orgId } });
  if (!order) throw new Error("NOT_FOUND");
  const next = nextStatus(order.status);
  if (!next) throw new Error("INVALID_TRANSITION");
  return prisma.cafeOrder.update({ where: { id: order.id }, data: { status: next } });
}

/**
 * Admin-only free-set status (any value in CafeOrderStatus, not forward-only).
 * Org-scoped — throws NOT_FOUND for cross-org ids.
 * FR-124
 */
export async function setOrderStatus(
  orgId: string,
  id: string,
  status: CafeOrderStatus,
) {
  const order = await prisma.cafeOrder.findFirst({ where: { id, orgId } });
  if (!order) throw new Error("NOT_FOUND");
  return prisma.cafeOrder.update({ where: { id: order.id }, data: { status } });
}
