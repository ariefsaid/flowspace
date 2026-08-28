import { describe, it, expect } from "vitest";
import { computeOrderTotals, priceOrderLines } from "@/lib/cafe/pricing";
import type { MenuItemForPricing } from "@/lib/cafe/pricing";
import type { PricedLine } from "@/lib/cafe/types";

const lines: PricedLine[] = [
  { menuItemId: "latte", nameSnapshot: "Latte", qty: 1, unitPriceRupiah: 32000, variantOptions: [] },
  { menuItemId: "croissant", nameSnapshot: "Croissant", qty: 2, unitPriceRupiah: 25000, variantOptions: [] },
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

describe("priceOrderLines", () => {
  const kopiSusu: MenuItemForPricing = {
    id: "kopi-susu",
    name: "Kopi Susu",
    priceRupiah: 22000,
    hasVariants: true,
    variantConfig: {
      variants: [
        {
          name: "Temperature",
          required: true,
          options: [
            { name: "Hot", priceAdjustment: 0 },
            { name: "Cold", priceAdjustment: 3000 },
          ],
        },
      ],
    },
  };
  const croissant: MenuItemForPricing = {
    id: "croissant",
    name: "Croissant",
    priceRupiah: 25000,
    hasVariants: false,
    variantConfig: null,
  };

  it("AC-703: computes unit price as base + validated option adjustment (Cold +Rp3.000)", () => {
    const priced = priceOrderLines([kopiSusu], [
      { menuItemId: "kopi-susu", qty: 1, options: [{ variantName: "Temperature", optionName: "Cold" }] },
    ]);
    expect(priced[0].unitPriceRupiah).toBe(25000);
    expect(priced[0].variantOptions).toEqual([
      { variantName: "Temperature", optionName: "Cold", priceAdjustmentRupiah: 3000 },
    ]);
  });

  it("AC-706: Rp22.000 Cold (+Rp3.000) + 2× Rp25.000 no-variant → subtotal Rp75.000, forged client fields ignored", () => {
    // Forged client price/adjustment/discount fields — cast to simulate an
    // attacker-controlled payload shape; priceOrderLines must ignore them.
    const forgedLines = [
      {
        menuItemId: "kopi-susu",
        qty: 1,
        options: [{ variantName: "Temperature", optionName: "Cold" }],
        unitPriceRupiah: 1,
        itemPrice: 1,
      },
      {
        menuItemId: "croissant",
        qty: 2,
        discountPct: 100,
      },
    ] as unknown as Parameters<typeof priceOrderLines>[1];
    const priced = priceOrderLines([kopiSusu, croissant], forgedLines);
    const totals = computeOrderTotals(priced, { discountPct: 0 });
    expect(totals.subtotalRupiah).toBe(75000);
  });

  it("AC-709: hasVariants=false prices at live base price; supplied options are rejected", () => {
    expect(() =>
      priceOrderLines([croissant], [
        { menuItemId: "croissant", qty: 1, options: [{ variantName: "Size", optionName: "Large" }] },
      ]),
    ).toThrow(/INVALID_VARIANTS/);

    const priced = priceOrderLines([croissant], [{ menuItemId: "croissant", qty: 1 }]);
    expect(priced[0].unitPriceRupiah).toBe(25000);
    expect(priced[0].variantOptions).toEqual([]);
  });

  it("rejects a line referencing a menu id not present in the live menu rows", () => {
    expect(() =>
      priceOrderLines([croissant], [{ menuItemId: "unknown-id", qty: 1 }]),
    ).toThrow(/INVALID_MENU_ITEMS/);
  });
});
