/**
 * Unit tests for the pure booking-pricing helpers (I-040, spec 0007).
 * Money math only — no DB, no tier-discount resolution (that lands with the
 * createBooking rewrite, Phase 5).
 */
import { describe, expect, it } from "vitest";
import { computeBookingPrice, computeWalkinBilledHours, resolveDiscountPct } from "@/lib/booking/pricing";

describe("computeBookingPrice", () => {
  it("AC-814: discount applies to rate × hours and rounds with Math.round", () => {
    // 3h × Rp25.000 = 75.000; 10% discount = 7.500 exactly.
    expect(
      computeBookingPrice({ hours: 3, ratePerHourRupiah: 25_000, discountPct: 10 }),
    ).toEqual({ baseAmountRupiah: 75_000, discountRupiah: 7_500, amountRupiah: 67_500 });
  });

  it("AC-814: rounds a fractional discount amount with Math.round (not truncation)", () => {
    // 1h × Rp15.000 = 15.000; 33% = 4.950 exactly (no rounding needed here) —
    // use a rate/pct combination that actually produces a .5 boundary.
    // 1h × Rp15.000 × 33% = 4950 (exact); use 1h × Rp10.000 × 12.5%-equivalent
    // isn't integer pct, so instead prove rounding with a case that lands on
    // .5: 3h × Rp10.000 = 30.000; 15% = 4.500 exactly. Use a genuinely
    // fractional case: hours=1, rate=10001, pct=50 -> 10001*0.5 = 5000.5 -> round = 5001.
    expect(
      computeBookingPrice({ hours: 1, ratePerHourRupiah: 10_001, discountPct: 50 }),
    ).toEqual({ baseAmountRupiah: 10_001, discountRupiah: 5_001, amountRupiah: 5_000 });
  });

  it("zero discount leaves the amount equal to the base", () => {
    expect(
      computeBookingPrice({ hours: 2, ratePerHourRupiah: 20_000, discountPct: 0 }),
    ).toEqual({ baseAmountRupiah: 40_000, discountRupiah: 0, amountRupiah: 40_000 });
  });
});

describe("computeWalkinBilledHours", () => {
  it("AC-812: 62 elapsed minutes bills ceil(62/60) = 2 hours (capped at 4)", () => {
    expect(computeWalkinBilledHours(62 * 60_000, 4)).toBe(2);
  });

  it("AC-844: elapsed time exceeding the facility's maxHoursCap bills exactly the cap", () => {
    expect(computeWalkinBilledHours(5 * 3_600_000, 4)).toBe(4);
  });

  it("bills a minimum of 1 hour even for a few elapsed minutes", () => {
    expect(computeWalkinBilledHours(5 * 60_000, 4)).toBe(1);
  });

  it("bills exactly 1 hour at exactly 60 elapsed minutes (no over-round)", () => {
    expect(computeWalkinBilledHours(60 * 60_000, 4)).toBe(1);
  });
});

describe("resolveDiscountPct", () => {
  const discounts = { coworkingDiscountPct: 10, meetingDiscountPct: 15 };

  it("AC-827: COWORKING_SEAT and WALKIN_COWORKING read coworkingDiscountPct", () => {
    expect(resolveDiscountPct("COWORKING_SEAT", discounts)).toBe(10);
    expect(resolveDiscountPct("WALKIN_COWORKING", discounts)).toBe(10);
  });

  it("AC-827: MEETING_ROOM and WALKIN_MEETING read meetingDiscountPct", () => {
    expect(resolveDiscountPct("MEETING_ROOM", discounts)).toBe(15);
    expect(resolveDiscountPct("WALKIN_MEETING", discounts)).toBe(15);
  });

  it("AC-827: FULL_ROOM (no owning dimension) fails safe to 0%", () => {
    expect(resolveDiscountPct("FULL_ROOM", discounts)).toBe(0);
  });

  it("AC-827: a missing/zeroed tier config row grants 0% (fail-safe)", () => {
    const zero = { coworkingDiscountPct: 0, meetingDiscountPct: 0 };
    expect(resolveDiscountPct("COWORKING_SEAT", zero)).toBe(0);
    expect(resolveDiscountPct("MEETING_ROOM", zero)).toBe(0);
  });
});
