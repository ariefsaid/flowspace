import { describe, it, expect } from "vitest";
import { resolveDiscountEligibility } from "@/lib/cafe/eligibility";

describe("resolveDiscountEligibility (ADR-0011: dormant until booking)", () => {
  it("returns false for a guest (no session)", async () => {
    expect(await resolveDiscountEligibility(null)).toBe(false);
  });

  it("returns false for a member (no booking domain yet)", async () => {
    expect(
      await resolveDiscountEligibility({ id: "u1", role: "MEMBER", orgId: "o1" }),
    ).toBe(false);
  });
});
