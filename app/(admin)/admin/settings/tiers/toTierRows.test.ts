import { describe, it, expect } from "vitest";
import { toTierRows } from "./toTierRows";
import type { MembershipTierConfig } from "@/lib/db/schema";

function row(overrides: Partial<MembershipTierConfig>): MembershipTierConfig {
  return {
    id: "x",
    orgId: "o1",
    tier: "PREMIUM",
    coworkingDiscountPct: 0,
    meetingDiscountPct: 0,
    cafeDiscountPct: 0,
    printDiscountPct: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("toTierRows", () => {
  it("projects a configured row to its TierRow shape", () => {
    const config = [
      row({ tier: "PREMIUM", coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 }),
    ];
    const rows = toTierRows(config);
    expect(rows.find((r) => r.tier === "PREMIUM")).toEqual({
      tier: "PREMIUM",
      coworkingDiscountPct: 10,
      meetingDiscountPct: 10,
      cafeDiscountPct: 5,
      printDiscountPct: 5,
    });
  });

  it("fails closed to four zeroes for a tier with no config row (missing-tier fail-safe)", () => {
    const config = [row({ tier: "PREMIUM", coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 })];
    const rows = toTierRows(config);
    expect(rows.find((r) => r.tier === "GOLD")).toEqual({
      tier: "GOLD",
      coworkingDiscountPct: 0,
      meetingDiscountPct: 0,
      cafeDiscountPct: 0,
      printDiscountPct: 0,
    });
  });

  it("returns exactly one row per known enum tier, in tier order", () => {
    const rows = toTierRows([]);
    expect(rows.map((r) => r.tier)).toEqual(["REGULAR", "PREMIUM", "GOLD"]);
  });
});
