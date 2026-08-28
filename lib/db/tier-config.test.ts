import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db } from "@/lib/db/drizzle";
import type { MembershipTier } from "@/lib/db/enums";

const insert = vi.fn();
vi.mock("@/lib/db/drizzle", () => ({
  db: {},
}));

import { updateTierDiscounts } from "@/lib/db/tier-config";

const txdb = { insert } as unknown as Pick<typeof db, "insert">;

describe("updateTierDiscounts validation (money-path pct/tier guards)", () => {
  beforeEach(() => insert.mockReset());

  it("AC-508: rejects fractional with the matching INVALID_PCT:<dimension> label", async () => {
    await expect(
      updateTierDiscounts("o1", "PREMIUM", {
        coworkingDiscountPct: 1, meetingDiscountPct: 1,
        cafeDiscountPct: 12.5, printDiscountPct: 1,
      }, txdb),
    ).rejects.toThrow("INVALID_PCT:cafe");
    expect(insert).not.toHaveBeenCalled();
  });

  it("AC-508: rejects negative/over-100 for a named dimension, no write", async () => {
    await expect(
      updateTierDiscounts("o1", "GOLD", {
        coworkingDiscountPct: -1, meetingDiscountPct: 1,
        cafeDiscountPct: 1, printDiscountPct: 1,
      }, txdb),
    ).rejects.toThrow("INVALID_PCT:coworking");
    await expect(
      updateTierDiscounts("o1", "GOLD", {
        coworkingDiscountPct: 1, meetingDiscountPct: 101,
        cafeDiscountPct: 1, printDiscountPct: 1,
      }, txdb),
    ).rejects.toThrow("INVALID_PCT:meeting");
    expect(insert).not.toHaveBeenCalled();
  });

  it("AC-523: rejects a tier outside the enum, no write", async () => {
    await expect(
      updateTierDiscounts("o1", "PLATINUM" as MembershipTier, {
        coworkingDiscountPct: 1, meetingDiscountPct: 1,
        cafeDiscountPct: 1, printDiscountPct: 1,
      }, txdb),
    ).rejects.toThrow("INVALID_TIER");
    expect(insert).not.toHaveBeenCalled();
  });
});
