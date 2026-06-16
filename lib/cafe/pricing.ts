/**
 * Server-side cafe order pricing (I-022, ADR-0011).
 * Pure function — no DB access.
 */
import type { OrderTotals, PricedLine } from "@/lib/cafe/types";

/** Member discount rate per ADR-0011 / OBS-070. */
export const MEMBER_DISCOUNT_RATE = 0.05;

/**
 * Computes subtotal, discount, and total for a set of priced lines.
 * discountEligible is resolved server-side by resolveDiscountEligibility (ADR-0011).
 */
export function computeOrderTotals(
  lines: PricedLine[],
  opts: { discountEligible: boolean },
): OrderTotals {
  const subtotalRupiah = lines.reduce((s, l) => s + l.unitPriceRupiah * l.qty, 0);
  const discountRupiah = opts.discountEligible
    ? Math.round(subtotalRupiah * MEMBER_DISCOUNT_RATE)
    : 0;
  return {
    subtotalRupiah,
    discountRupiah,
    totalRupiah: subtotalRupiah - discountRupiah,
  };
}
