/**
 * savePricingConfigAction denies non-ADMIN callers (no write). Also confirms
 * an ADMIN caller persists all four dims via the repos with the session
 * orgId, and that a mid-loop validation failure surfaces without partial
 * success (each `it()` title below names its own owning acceptance criterion).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSession = vi.fn();
const updateTierDiscounts = vi.fn();
const updatePrintPricing = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireSession: () => requireSession(),
}));
vi.mock("@/lib/db/tier-config", () => ({
  updateTierDiscounts: (...a: unknown[]) => updateTierDiscounts(...a),
}));
vi.mock("@/lib/db/print-pricing", () => ({
  updatePrintPricing: (...a: unknown[]) => updatePrintPricing(...a),
}));
// db.transaction just runs the callback with a stub tx (the repos are mocked).
vi.mock("@/lib/db/drizzle", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { savePricingConfigAction } from "./actions";

const input = {
  printPricing: { bwRatePerPageRupiah: 500, colorRatePerPageRupiah: 1500 },
  tiers: [
    { tier: "REGULAR" as const, coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 },
    { tier: "PREMIUM" as const, coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 },
    { tier: "GOLD" as const, coworkingDiscountPct: 15, meetingDiscountPct: 15, cafeDiscountPct: 10, printDiscountPct: 10 },
  ],
};

describe("savePricingConfigAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    updateTierDiscounts.mockReset();
    updatePrintPricing.mockReset();
  });

  it("AC-510: a MEMBER is denied (FORBIDDEN) and nothing is written", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(savePricingConfigAction(input)).rejects.toThrow("FORBIDDEN");
    expect(updatePrintPricing).not.toHaveBeenCalled();
    expect(updateTierDiscounts).not.toHaveBeenCalled();
  });

  it("AC-524: a BARISTA is denied (FORBIDDEN), no write", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "BARISTA", orgId: "o1" });
    await expect(savePricingConfigAction(input)).rejects.toThrow("FORBIDDEN");
    expect(updatePrintPricing).not.toHaveBeenCalled();
    expect(updateTierDiscounts).not.toHaveBeenCalled();
  });

  it("AC-521: an ADMIN persists print pricing + all four dims for every known tier with the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await savePricingConfigAction(input);
    expect(updatePrintPricing).toHaveBeenCalledWith(
      "o1",
      input.printPricing,
      expect.anything(), // the tx handle
    );
    expect(updateTierDiscounts).toHaveBeenCalledTimes(3);
    expect(updateTierDiscounts).toHaveBeenCalledWith(
      "o1",
      "PREMIUM",
      { coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 },
      expect.anything(),
    );
    expect(updateTierDiscounts).toHaveBeenCalledWith(
      "o1",
      "GOLD",
      { coworkingDiscountPct: 15, meetingDiscountPct: 15, cafeDiscountPct: 10, printDiscountPct: 10 },
      expect.anything(),
    );
  });

  it("AC-526: an ADMIN save with an invalid dimension (101) surfaces the repo's rejection, no partial success", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    updateTierDiscounts.mockImplementation(async (_orgId: string, tier: string) => {
      if (tier === "PREMIUM") throw new Error("INVALID_PCT:cafe");
    });
    const invalidInput = {
      ...input,
      tiers: [
        input.tiers[0],
        { tier: "PREMIUM" as const, coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 101, printDiscountPct: 5 },
        input.tiers[2],
      ],
    };
    await expect(savePricingConfigAction(invalidInput)).rejects.toThrow("INVALID_PCT:cafe");
  });
});
