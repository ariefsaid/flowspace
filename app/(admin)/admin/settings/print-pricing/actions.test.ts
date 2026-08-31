/**
 * upsertPrintPricingCellAction denies non-ADMIN callers (no write) and, for
 * an ADMIN, forwards the cell to the repo with the session orgId; a repo
 * validation rejection surfaces to the caller unchanged so the client can
 * show it inline (each `it()` title names its own owning acceptance criterion).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSession = vi.fn();
const upsertPrintPricingCell = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireSession: () => requireSession(),
}));
vi.mock("@/lib/db/print-pricing", () => ({
  upsertPrintPricingCell: (...a: unknown[]) => upsertPrintPricingCell(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { upsertPrintPricingCellAction } from "./actions";

const cell = {
  colorMode: "BW" as const,
  paperSize: "A4",
  pricePerPageRupiah: 500,
  isActive: true,
};

describe("upsertPrintPricingCellAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    upsertPrintPricingCell.mockReset();
  });

  it("AC-P10: a MEMBER is denied (FORBIDDEN) and nothing is written", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(upsertPrintPricingCellAction(cell)).rejects.toThrow("FORBIDDEN");
    expect(upsertPrintPricingCell).not.toHaveBeenCalled();
  });

  it("AC-P11: a BARISTA is denied (FORBIDDEN), no write", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "BARISTA", orgId: "o1" });
    await expect(upsertPrintPricingCellAction(cell)).rejects.toThrow("FORBIDDEN");
    expect(upsertPrintPricingCell).not.toHaveBeenCalled();
  });

  it("AC-P12: an ADMIN upserts the cell with the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    upsertPrintPricingCell.mockResolvedValueOnce(undefined);
    await upsertPrintPricingCellAction(cell);
    expect(upsertPrintPricingCell).toHaveBeenCalledWith("o1", cell);
  });

  it("AC-P13: an ADMIN's invalid price surfaces the repo's rejection unchanged", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    upsertPrintPricingCell.mockRejectedValueOnce(new Error("INVALID_RATE"));
    await expect(upsertPrintPricingCellAction(cell)).rejects.toThrow("INVALID_RATE");
  });
});
