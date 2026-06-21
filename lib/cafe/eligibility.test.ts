import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the bookings repo: the eligibility decision logic is unit-owned here;
// the org-scoped DB contract for getActiveBooking is owned by bookings int tests.
const getActiveBooking = vi.fn();
vi.mock("@/lib/db/bookings", () => ({
  getActiveBooking: (...args: unknown[]) => getActiveBooking(...args),
}));

import { resolveDiscountEligibility } from "@/lib/cafe/eligibility";

const activeBooking = { id: "b1", status: "ACTIVE" };

describe("resolveDiscountEligibility (ADR-0011 / OBS-070: active-session member discount)", () => {
  beforeEach(() => getActiveBooking.mockReset());

  it("returns false for a guest (no session)", async () => {
    expect(await resolveDiscountEligibility(null)).toBe(false);
    expect(getActiveBooking).not.toHaveBeenCalled();
  });

  it("returns false for a non-member role even with an active booking", async () => {
    getActiveBooking.mockResolvedValue(activeBooking);
    expect(
      await resolveDiscountEligibility({ id: "a1", role: "ADMIN", orgId: "o1" }),
    ).toBe(false);
    expect(getActiveBooking).not.toHaveBeenCalled();
  });

  it("returns false for a member with no active booking", async () => {
    getActiveBooking.mockResolvedValue(null);
    expect(
      await resolveDiscountEligibility({ id: "u1", role: "MEMBER", orgId: "o1" }),
    ).toBe(false);
  });

  it("AC-115: returns true for a member with an active booking (org-scoped)", async () => {
    getActiveBooking.mockResolvedValue(activeBooking);
    expect(
      await resolveDiscountEligibility({ id: "u1", role: "MEMBER", orgId: "o1" }),
    ).toBe(true);
    expect(getActiveBooking).toHaveBeenCalledWith("o1", "u1");
  });
});
