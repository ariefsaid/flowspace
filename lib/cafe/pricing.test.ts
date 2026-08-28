import { describe, it, expect } from "vitest";
import { computeOrderTotals } from "@/lib/cafe/pricing";
import type { PricedLine } from "@/lib/cafe/types";

const lines: PricedLine[] = [
  { menuItemId: "latte", nameSnapshot: "Latte", qty: 1, unitPriceRupiah: 32000 },
  { menuItemId: "croissant", nameSnapshot: "Croissant", qty: 2, unitPriceRupiah: 25000 },
];

describe("computeOrderTotals", () => {
  it("AC-110 / AC-406: 0% → subtotal=total, discount=0", () => {
    expect(computeOrderTotals(lines, { discountPct: 0 })).toEqual({
      subtotalRupiah: 82000,
      discountRupiah: 0,
      totalRupiah: 82000,
    });
  });

  it("AC-111 / AC-406: 5% rounded discount", () => {
    expect(computeOrderTotals(lines, { discountPct: 5 })).toEqual({
      subtotalRupiah: 82000,
      discountRupiah: 4100,
      totalRupiah: 77900,
    });
  });

  it("AC-406: a different configured rate (10%) applies", () => {
    expect(computeOrderTotals(lines, { discountPct: 10 })).toEqual({
      subtotalRupiah: 82000,
      discountRupiah: 8200,
      totalRupiah: 73800,
    });
  });

  it("AC-514: discount rounds with Math.round on a fractional-Rupiah subtotal", () => {
    // subtotal 100000 × 3 = ... use a subtotal that fractions: 3 lines summing to 100001
    const frac: PricedLine[] = [
      { menuItemId: "a", nameSnapshot: "A", qty: 1, unitPriceRupiah: 50000 },
      { menuItemId: "b", nameSnapshot: "B", qty: 1, unitPriceRupiah: 33334 },
      { menuItemId: "c", nameSnapshot: "C", qty: 1, unitPriceRupiah: 16667 },
    ]; // subtotal = 100001
    // 10% → 10000.1 → Math.round → 10000
    expect(computeOrderTotals(frac, { discountPct: 10 })).toEqual({
      subtotalRupiah: 100001,
      discountRupiah: 10000,
      totalRupiah: 90001,
    });
  });
});
