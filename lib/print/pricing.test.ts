import { describe, it, expect } from "vitest";
import {
  computePrintTotal,
  PRINT_RATE_BW,
  PRINT_RATE_COLOR,
} from "@/lib/print/pricing";

describe("computePrintTotal", () => {
  it("AC-0230: BW, REGULAR — no discount, rate × pages × copies", () => {
    const t = computePrintTotal({
      pages: 10,
      copies: 1,
      colorMode: "BW",
      tier: "REGULAR",
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
      tier: "REGULAR",
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
      tier: "REGULAR",
    });
    expect(t.totalRupiah).toBe(18000); // 500 × 12 × 3
  });

  it("AC-0233: PREMIUM tier applies 20% discount, rounded", () => {
    const t = computePrintTotal({
      pages: 12,
      copies: 1,
      colorMode: "BW",
      tier: "PREMIUM",
    });
    // subtotal 6000 → 20% = 1200 → total 4800
    expect(t.discountRupiah).toBe(1200);
    expect(t.totalRupiah).toBe(4800);
  });

  it("AC-0233: GOLD tier shares the 20% discount", () => {
    const t = computePrintTotal({
      pages: 20,
      copies: 2,
      colorMode: "COLOR",
      tier: "GOLD",
    });
    // subtotal = 1500 × 20 × 2 = 60000 → 20% = 12000 → 48000
    expect(t.discountRupiah).toBe(12000);
    expect(t.totalRupiah).toBe(48000);
  });

  it("discount rounds to whole Rupiah on non-even subtotals", () => {
    const t = computePrintTotal({
      pages: 1,
      copies: 1,
      colorMode: "COLOR",
      tier: "PREMIUM",
    });
    // subtotal 1500 → 20% = 300 exactly
    expect(t.discountRupiah).toBe(300);
    expect(t.totalRupiah).toBe(1200);
  });
});
