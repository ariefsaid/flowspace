// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(), createPrinter: vi.fn(), updatePrintPricing: vi.fn(),
  createPrintAgentConfig: vi.fn(), advancePrintJob: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/printers", () => ({ createPrinter: mocks.createPrinter }));
vi.mock("@/lib/db/print-agent", () => ({ createPrintAgentConfig: mocks.createPrintAgentConfig }));
vi.mock("@/lib/db/print", () => ({ advancePrintJob: mocks.advancePrintJob }));
vi.mock("@/lib/db/tier-config", () => ({ updateTierDiscounts: vi.fn() }));
vi.mock("@/lib/db/print-pricing", () => ({ updatePrintPricing: mocks.updatePrintPricing }));
vi.mock("@/lib/db/drizzle", () => ({ db: { transaction: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createPrinterAction } from "./printers/actions";
import { createPrintServerAction } from "./print-server/actions";
import { advancePrintJobAction } from "../print-reports/actions";
import { savePricingConfigAction } from "./tiers/actions";

describe("print authorization boundary", () => {
  beforeEach(() => { mocks.requireSession.mockReset(); for (const fn of [mocks.createPrinter, mocks.updatePrintPricing, mocks.createPrintAgentConfig, mocks.advancePrintJob]) fn.mockReset(); });
  it("AC-624: MEMBER and BARISTA cannot invoke pricing, printer, agent-key, or status mutations", async () => {
    const calls: Array<Promise<unknown>> = [];
    for (const role of ["MEMBER", "BARISTA"] as const) {
      mocks.requireSession.mockResolvedValue({ id: "u", orgId: "org-1", role });
      calls.push(createPrinterAction({ name: "cups", displayName: "Printer", colorSupport: false, paperSizes: ["A4"] }));
      calls.push(createPrintServerAction());
      calls.push(advancePrintJobAction({ jobId: "job", status: "PROCESSING" }));
      calls.push(savePricingConfigAction({ printPricing: { bwRatePerPageRupiah: 500, colorRatePerPageRupiah: 2000 }, tiers: [] }));
    }
    for (const call of calls) await expect(call).rejects.toThrow("FORBIDDEN");
    expect(mocks.createPrinter).not.toHaveBeenCalled();
    expect(mocks.createPrintAgentConfig).not.toHaveBeenCalled();
    expect(mocks.advancePrintJob).not.toHaveBeenCalled();
    expect(mocks.updatePrintPricing).not.toHaveBeenCalled();
  });
});
