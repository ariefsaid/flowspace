/**
 * Server-side cafe order pricing (I-022 / I-027, ADR-0011).
 * Pure function — no DB access. The repository resolves the member's tier
 * `cafeDiscountPct` from config (when discount-eligible per AC-115) and passes
 * it in; the client preview is never trusted.
 */
import type { OrderTotals, PricedLine } from "@/lib/cafe/types";

/** Default member cafe discount % (the seed for membership_tier_config.cafe_discount_pct, OBS-070). */
export const DEFAULT_CAFE_DISCOUNT_PCT = 5;

/**
 * Computes subtotal, discount, and total for a set of priced lines.
 * `discountPct` (0–100) is resolved server-side: the member tier's
 * `cafeDiscountPct` when eligible (active session), else 0.
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
