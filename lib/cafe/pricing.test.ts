import { describe, it, expect } from "vitest";
import { computeOrderTotals } from "@/lib/cafe/pricing";
import type { PricedLine } from "@/lib/cafe/types";

const lines: PricedLine[] = [
  { menuItemId: "latte", nameSnapshot: "Latte", qty: 1, unitPriceRupiah: 32000 },
  { menuItemId: "croissant", nameSnapshot: "Croissant", qty: 2, unitPriceRupiah: 25000 },
];

describe("computeOrderTotals", () => {
  it("AC-110: no discount → subtotal=total, discount=0", () => {
    expect(computeOrderTotals(lines, { discountEligible: false })).toEqual({
      subtotalRupiah: 82000,
      discountRupiah: 0,
      totalRupiah: 82000,
    });
  });

  it("AC-111: eligible → 5% rounded discount", () => {
    expect(computeOrderTotals(lines, { discountEligible: true })).toEqual({
      subtotalRupiah: 82000,
      discountRupiah: 4100,
      totalRupiah: 77900,
    });
  });
});
