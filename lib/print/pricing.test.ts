import { describe, it, expect } from "vitest";
import {
  computePrintTotal,
  PRINT_RATE_BW,
  PRINT_RATE_COLOR,
} from "@/lib/print/pricing";

// Default base rates passed explicitly (the repo resolves these from config).
const RATES = { bwRateRupiah: PRINT_RATE_BW, colorRateRupiah: PRINT_RATE_COLOR };

describe("computePrintTotal", () => {
  it("AC-0230 / AC-406: BW, 0% — rate × pages × copies, no discount", () => {
    const t = computePrintTotal({
      pages: 10,
      copies: 1,
      colorMode: "BW",
      ...RATES,
      discountPct: 0,
    });
    expect(t.pricePerPageRupiah).toBe(PRINT_RATE_BW);
    expect(t.discountRupiah).toBe(0);
    expect(t.totalRupiah).toBe(5000); // 500 × 10 × 1
  });

  it("AC-0231: COLOR rate is 3× BW", () => {
    const t = computePrintTotal({
      pages: 10,
      copies: 1,
      colorMode: "COLOR",
      ...RATES,
      discountPct: 0,
    });
    expect(t.pricePerPageRupiah).toBe(PRINT_RATE_COLOR);
    expect(t.pricePerPageRupiah).toBe(PRINT_RATE_BW * 3);
    expect(t.totalRupiah).toBe(15000); // 1500 × 10 × 1
  });

  it("AC-0232: copies multiply the sheet count", () => {
    const t = computePrintTotal({
      pages: 12,
      copies: 3,
      colorMode: "BW",
      ...RATES,
      discountPct: 0,
    });
    expect(t.totalRupiah).toBe(18000); // 500 × 12 × 3
  });

  it("AC-0233 / AC-406: a 20% discount applies, rounded", () => {
    const t = computePrintTotal({
      pages: 12,
      copies: 1,
      colorMode: "BW",
      ...RATES,
      discountPct: 20,
    });
    // subtotal 6000 → 20% = 1200 → total 4800
    expect(t.discountRupiah).toBe(1200);
    expect(t.totalRupiah).toBe(4800);
  });

  it("AC-406: a configured base rate overrides the default", () => {
    const t = computePrintTotal({
      pages: 10,
      copies: 1,
      colorMode: "COLOR",
      bwRateRupiah: 600,
      colorRateRupiah: 2000, // org-configured COLOR rate
      discountPct: 0,
    });
    expect(t.pricePerPageRupiah).toBe(2000);
    expect(t.totalRupiah).toBe(20000); // 2000 × 10
  });

  it("AC-406: discount rounds to whole Rupiah on non-even subtotals", () => {
    const t = computePrintTotal({
      pages: 20,
      copies: 2,
      colorMode: "COLOR",
      ...RATES,
      discountPct: 20,
    });
    // subtotal = 1500 × 20 × 2 = 60000 → 20% = 12000 → 48000
    expect(t.discountRupiah).toBe(12000);
    expect(t.totalRupiah).toBe(48000);
  });
});
