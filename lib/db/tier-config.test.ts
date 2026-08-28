import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
vi.mock("@/lib/db/drizzle", () => ({
  db: {},
}));

import { updateTierDiscounts } from "@/lib/db/tier-config";

describe("updateTierDiscounts validation (AC-508 / AC-523 / AC-526)", () => {
  beforeEach(() => insert.mockReset());

  it("AC-508: rejects fractional with the matching INVALID_PCT:<dimension> label", async () => {
    await expect(
      updateTierDiscounts("o1", "PREMIUM", {
        coworkingDiscountPct: 1, meetingDiscountPct: 1,
        cafeDiscountPct: 12.5, printDiscountPct: 1,
      }, { insert } as never),
    ).rejects.toThrow("INVALID_PCT:cafe");
    expect(insert).not.toHaveBeenCalled();
  });

  it("AC-508: rejects negative/over-100 for a named dimension, no write", async () => {
    await expect(
      updateTierDiscounts("o1", "GOLD", {
        coworkingDiscountPct: -1, meetingDiscountPct: 1,
        cafeDiscountPct: 1, printDiscountPct: 1,
      }, { insert } as never),
    ).rejects.toThrow("INVALID_PCT:coworking");
    await expect(
      updateTierDiscounts("o1", "GOLD", {
        coworkingDiscountPct: 1, meetingDiscountPct: 101,
        cafeDiscountPct: 1, printDiscountPct: 1,
      }, { insert } as never),
    ).rejects.toThrow("INVALID_PCT:meeting");
    expect(insert).not.toHaveBeenCalled();
  });

  it("AC-523 / AC-526: rejects a tier outside the enum, no write", async () => {
    await expect(
      updateTierDiscounts("o1", "PLATINUM" as never, {
        coworkingDiscountPct: 1, meetingDiscountPct: 1,
        cafeDiscountPct: 1, printDiscountPct: 1,
      }, { insert } as never),
    ).rejects.toThrow("INVALID_TIER");
    expect(insert).not.toHaveBeenCalled();
  });
});
