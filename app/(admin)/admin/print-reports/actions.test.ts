import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSession, advancePrintJob, revalidatePath } = vi.hoisted(() => ({
  requireSession: vi.fn(),
  advancePrintJob: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: () => requireSession() }));
vi.mock("@/lib/db/print", () => ({ advancePrintJob: (...args: unknown[]) => advancePrintJob(...args) }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { advancePrintJobAction } from "./actions";

describe("advancePrintJobAction", () => {
  beforeEach(() => { requireSession.mockReset(); advancePrintJob.mockReset(); revalidatePath.mockReset(); });

  it("ADMIN can progress pending, processing, and ready jobs with the session org", async () => {
    requireSession.mockResolvedValue({ id: "admin", orgId: "org-1", role: "ADMIN" });
    await advancePrintJobAction({ jobId: "job-1", status: "PROCESSING", processedBy: "admin" });
    expect(advancePrintJob).toHaveBeenCalledWith("org-1", "job-1", "PROCESSING", { processedBy: "admin", errorMessage: undefined });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/print-reports");
  });

  it("MEMBER and BARISTA are denied before the repository call", async () => {
    for (const role of ["MEMBER", "BARISTA"] as const) {
      requireSession.mockResolvedValue({ id: "u", orgId: "org-1", role });
      await expect(advancePrintJobAction({ jobId: "job-1", status: "READY" })).rejects.toThrow("FORBIDDEN");
    }
    expect(advancePrintJob).not.toHaveBeenCalled();
  });
});
