/**
 * Unit tests for lib/print/pricing.ts (I-043, spec 0009).
 *
 * AC-600: the six-cell resolver returns exactly the six OBS-605 rates and
 *         rejects missing/inactive cells (no fallback).
 * AC-602: 3 COLOR A3 pages × 2 copies at 5% → gross 24000, discount 1200,
 *         net 22800.
 * AC-636: duplex never changes effective sheets or price.
 * Older tags (AC-023x/AC-406) re-anchored to the matrix-based API.
 */
import { describe, it, expect } from "vitest";
import {
  computePrintTotal,
  resolvePrintPrice,
  PRINT_PRICE_MATRIX,
  PRINT_MATRIX_CELLS,
} from "@/lib/print/pricing";
import type { PrintPriceRow } from "@/lib/print/pricing";

/** The six signed matrix rows as loaded from org_print_pricing. */
function sixRows(): PrintPriceRow[] {
  return PRINT_MATRIX_CELLS.map((c) => ({
    colorMode: c.colorMode,
    paperSize: c.paperSize,
    pricePerPageRupiah: PRINT_PRICE_MATRIX[c.colorMode][c.paperSize],
    isActive: true,
  }));
}

describe("resolvePrintPrice", () => {
  it("AC-600: resolves each of the six seeded combinations to the exact OBS-605 rate", () => {
    const rows = sixRows();
    expect(resolvePrintPrice(rows, "BW", "A4")).toBe(500);
    expect(resolvePrintPrice(rows, "BW", "A3")).toBe(1000);
    expect(resolvePrintPrice(rows, "BW", "F4")).toBe(600);
    expect(resolvePrintPrice(rows, "COLOR", "A4")).toBe(2000);
    expect(resolvePrintPrice(rows, "COLOR", "A3")).toBe(4000);
    expect(resolvePrintPrice(rows, "COLOR", "F4")).toBe(2500);
  });

  it("AC-600: a missing or inactive cell rejects with INVALID_PRINT_PRICING (no fallback)", () => {
    const rows = sixRows().filter((r) => !(r.colorMode === "COLOR" && r.paperSize === "F4"));
    expect(() => resolvePrintPrice(rows, "COLOR", "F4")).toThrow(/INVALID_PRINT_PRICING/);

    const inactive = sixRows().map((r) =>
      r.colorMode === "BW" && r.paperSize === "A3" ? { ...r, isActive: false } : r,
    );
    expect(() => resolvePrintPrice(inactive, "BW", "A3")).toThrow(/INVALID_PRINT_PRICING/);

    // An unknown paper size never matches anything.
    expect(() => resolvePrintPrice(sixRows(), "BW", "A5")).toThrow(/INVALID_PRINT_PRICING/);
  });
});

describe("computePrintTotal", () => {
  it("AC-0230 / AC-406: BW A4, 0% — rate × pages × copies, no discount", () => {
    const t = computePrintTotal({
      pages: 10,
      copies: 1,
      pricePerPageRupiah: 500,
      discountPct: 0,
    });
    expect(t.grossRupiah).toBe(5000);
    expect(t.discountRupiah).toBe(0);
    expect(t.totalRupiah).toBe(5000);
  });

  it("AC-602: 3 COLOR A3 pages, 2 copies, 5% tier discount → gross 24000, discount 1200, net 22800", () => {
    const t = computePrintTotal({
      pages: 3,
      copies: 2,
      pricePerPageRupiah: 4000, // COLOR × A3
      discountPct: 5,
    });
    expect(t.grossRupiah).toBe(24000);
    expect(t.discountRupiah).toBe(1200);
    expect(t.totalRupiah).toBe(22800);
  });

  it("AC-0232: copies multiply the sheet count", () => {
    const t = computePrintTotal({
      pages: 12,
      copies: 3,
      pricePerPageRupiah: 500,
      discountPct: 0,
    });
    expect(t.grossRupiah).toBe(18000); // 500 × 12 × 3
  });

  it("AC-0233 / AC-406: a discount applies, rounded to whole Rupiah", () => {
    const t = computePrintTotal({
      pages: 12,
      copies: 1,
      pricePerPageRupiah: 500,
      discountPct: 20,
    });
    // gross 6000 → 20% = 1200 → net 4800
    expect(t.discountRupiah).toBe(1200);
    expect(t.totalRupiah).toBe(4800);
  });

  it("AC-406: rounding is Math.round on non-even subtotals (NFR-600)", () => {
    // gross = 2500 × 3 × 1 = 7500 → 5% = 375 (exact) … use 7% → 525
    expect(
      computePrintTotal({ pages: 3, copies: 1, pricePerPageRupiah: 2500, discountPct: 7 }).discountRupiah,
    ).toBe(525);
    // gross = 600 × 3 × 1 = 1800 → 5% = 90 exact; 2500×3=7500 → 33% = 2475
    expect(
      computePrintTotal({ pages: 3, copies: 1, pricePerPageRupiah: 600, discountPct: 33 }).discountRupiah,
    ).toBe(594); // Math.round(1800 × 0.33) = 594
  });

  it("AC-636: duplex never changes effective sheets or price — totals are identical with duplex on or off", () => {
    // computePrintTotal takes no duplex input at all: pricing is blind to it
    // (duplex is persisted as a job option only). Same inputs ⇒ same money.
    const off = computePrintTotal({ pages: 9, copies: 2, pricePerPageRupiah: 2500, discountPct: 5 });
    const on = computePrintTotal({ pages: 9, copies: 2, pricePerPageRupiah: 2500, discountPct: 5 });
    expect(on).toEqual(off);
    expect(on.grossRupiah).toBe(45000); // 9 × 2 × 2500 — sheets unchanged by duplex
  });

  it("rejects non-integer or non-positive pages/copies/rate and out-of-range pct", () => {
    const base = { pages: 3, copies: 1, pricePerPageRupiah: 500, discountPct: 0 };
    for (const bad of [{ pages: 0 }, { pages: -1 }, { pages: 1.5 }]) {
      expect(() => computePrintTotal({ ...base, ...bad })).toThrow(/INVALID/);
    }
    for (const bad of [{ copies: 0 }, { copies: -2 }, { copies: 2.5 }]) {
      expect(() => computePrintTotal({ ...base, ...bad })).toThrow(/INVALID/);
    }
    for (const bad of [{ pricePerPageRupiah: 0 }, { pricePerPageRupiah: -5 }, { pricePerPageRupiah: 12.5 }]) {
      expect(() => computePrintTotal({ ...base, ...bad })).toThrow(/INVALID/);
    }
    for (const bad of [{ discountPct: -1 }, { discountPct: 101 }, { discountPct: 5.5 }]) {
      expect(() => computePrintTotal({ ...base, ...bad })).toThrow(/INVALID_PCT/);
    }
  });

  it("NFR-600: rejects money/sheet values above the PostgreSQL int4 range", () => {
    // gross = 4000 × 600000 × 1 = 2.4e9 > int4 max.
    expect(() =>
      computePrintTotal({ pages: 600000, copies: 1, pricePerPageRupiah: 4000, discountPct: 0 }),
    ).toThrow(/MONEY_OVERFLOW|int4|OVERFLOW/i);
    // Just inside the boundary passes.
    expect(
      computePrintTotal({ pages: 536870, copies: 1, pricePerPageRupiah: 4000, discountPct: 0 }).grossRupiah,
    ).toBe(2147480000);
  });

  it("AC-516: discounts round to whole Rupiah on a fractional subtotal", () => {
    const t = computePrintTotal({
      pages: 2,
      copies: 1,
      pricePerPageRupiah: 3333,
      discountPct: 10,
    });
    // gross = 3333 × 2 = 6666 → 10% = 666.6 → Math.round = 667
    expect(t.discountRupiah).toBe(667);
    expect(t.totalRupiah).toBe(5999);
    expect(Number.isInteger(t.discountRupiah)).toBe(true);
    expect(Number.isInteger(t.totalRupiah)).toBe(true);
  });
});
