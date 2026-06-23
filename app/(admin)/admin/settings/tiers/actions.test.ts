/**
 * AC-404: savePricingConfigAction denies non-ADMIN callers (no write).
 * Also confirms an ADMIN caller persists via the repos with the session orgId.
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
    { tier: "REGULAR" as const, cafeDiscountPct: 5, printDiscountPct: 0 },
    { tier: "PREMIUM" as const, cafeDiscountPct: 5, printDiscountPct: 20 },
  ],
};

describe("savePricingConfigAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    updateTierDiscounts.mockReset();
    updatePrintPricing.mockReset();
  });

  it("AC-404: a MEMBER is denied (FORBIDDEN) and nothing is written", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(savePricingConfigAction(input)).rejects.toThrow("FORBIDDEN");
    expect(updatePrintPricing).not.toHaveBeenCalled();
    expect(updateTierDiscounts).not.toHaveBeenCalled();
  });

  it("AC-404: a BARISTA is denied (FORBIDDEN)", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "BARISTA", orgId: "o1" });
    await expect(savePricingConfigAction(input)).rejects.toThrow("FORBIDDEN");
    expect(updateTierDiscounts).not.toHaveBeenCalled();
  });

  it("an ADMIN persists print pricing + each tier with the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await savePricingConfigAction(input);
    expect(updatePrintPricing).toHaveBeenCalledWith(
      "o1",
      input.printPricing,
      expect.anything(), // the tx handle
    );
    expect(updateTierDiscounts).toHaveBeenCalledTimes(2);
    expect(updateTierDiscounts).toHaveBeenCalledWith(
      "o1",
      "PREMIUM",
      { cafeDiscountPct: 5, printDiscountPct: 20 },
      expect.anything(),
    );
  });
});
