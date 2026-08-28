import { describe, it, expect } from "vitest";
import { LOCKED_TIER_DISCOUNTS } from "@/lib/tier-discounts";
import * as cafePricing from "@/lib/cafe/pricing";
import * as printPricing from "@/lib/print/pricing";

describe("LOCKED_TIER_DISCOUNTS", () => {
  it("AC-527: holds the exact locked 4-dim values (no 5/5/5 or 0/20/20 guess)", () => {
    expect(LOCKED_TIER_DISCOUNTS.REGULAR).toEqual({ coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 });
    expect(LOCKED_TIER_DISCOUNTS.PREMIUM).toEqual({ coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 });
    expect(LOCKED_TIER_DISCOUNTS.GOLD).toEqual({ coworkingDiscountPct: 15, meetingDiscountPct: 15, cafeDiscountPct: 10, printDiscountPct: 10 });
  });

  it("AC-527: stale spec-0006 guess constants are removed from pricing defaults", () => {
    expect("DEFAULT_CAFE_DISCOUNT_PCT" in cafePricing).toBe(false);
    expect("DEFAULT_PRINT_DISCOUNT_PCT" in printPricing).toBe(false);
  });
});
