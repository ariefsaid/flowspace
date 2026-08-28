/**
 * Server-side cafe order pricing (I-022 / I-027 / I-044, ADR-0011).
 * Pure function — no DB access. The repository resolves the member's tier
 * `cafeDiscountPct` from config (when discount-eligible per AC-115) and passes
 * it in; the client preview is never trusted.
 */
import type { OrderLineInput, OrderTotals, PricedLine, VariantConfig } from "@/lib/cafe/types";
import { validateVariantSelections } from "@/lib/cafe/variants";

/** The minimal live-menu-row shape `priceOrderLines` needs — org/availability are the caller's concern. */
export interface MenuItemForPricing {
  id: string;
  name: string;
  priceRupiah: number;
  hasVariants: boolean;
  variantConfig: VariantConfig | null;
}

/**
 * Prices a set of order lines against live menu rows (I-044, FR-721/722/723).
 * `unitPriceRupiah = priceRupiah + Σ snapshot.priceAdjustmentRupiah`; any
 * extra client-supplied field on a line (price/subtotal/discount/adjustment)
 * is ignored — only `menuItemId`, `qty`, and `options` are read. Throws
 * `INVALID_MENU_ITEMS` for a line whose `menuItemId` is not in `menuItems`.
 */
export function priceOrderLines(
  menuItems: MenuItemForPricing[],
  lines: OrderLineInput[],
): PricedLine[] {
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  return lines.map((line) => {
    const item = byId.get(line.menuItemId);
    if (!item) throw new Error("INVALID_MENU_ITEMS");
    const variantOptions = validateVariantSelections(item, line.options);
    const unitPriceRupiah =
      item.priceRupiah + variantOptions.reduce((s, o) => s + o.priceAdjustmentRupiah, 0);
    return {
      menuItemId: item.id,
      nameSnapshot: item.name,
      qty: line.qty,
      unitPriceRupiah,
      variantOptions,
    };
  });
}

/**
 * Computes subtotal, discount, and total for a set of priced lines.
 * `discountPct` (0–100) is resolved server-side: the member tier's
 * `cafeDiscountPct` when eligible (active session), else 0. The fail-safe for
 * a missing/unconfigured tier is the repo's `getTierDiscounts` (0%, I-041).
 */
export function computeOrderTotals(
  lines: PricedLine[],
  opts: { discountPct: number },
): OrderTotals {
  const subtotalRupiah = lines.reduce((s, l) => s + l.unitPriceRupiah * l.qty, 0);
  const discountRupiah = Math.round(subtotalRupiah * (opts.discountPct / 100));
  return {
    subtotalRupiah,
    discountRupiah,
    totalRupiah: subtotalRupiah - discountRupiah,
  };
}
