import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSession, createPrintAgentConfig, rotatePrintAgentKey, revalidatePath } = vi.hoisted(() => ({
  requireSession: vi.fn(), createPrintAgentConfig: vi.fn(), rotatePrintAgentKey: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("@/lib/db/print-agent", () => ({ createPrintAgentConfig, rotatePrintAgentKey }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { createPrintServerAction, rotatePrintServerAction } from "./actions";

describe("print-server admin actions", () => {
  beforeEach(() => { requireSession.mockReset(); createPrintAgentConfig.mockReset(); rotatePrintAgentKey.mockReset(); revalidatePath.mockReset(); });

  it(": MEMBER and BARISTA cannot create or rotate keys and make no repo calls", async () => {
    for (const role of ["MEMBER", "BARISTA"] as const) {
      requireSession.mockResolvedValue({ id: "u", orgId: "org-1", role });
      await expect(createPrintServerAction({ serverName: "Mini PC" })).rejects.toThrow("FORBIDDEN");
      await expect(rotatePrintServerAction()).rejects.toThrow("FORBIDDEN");
    }
    expect(createPrintAgentConfig).not.toHaveBeenCalled();
    expect(rotatePrintAgentKey).not.toHaveBeenCalled();
  });

  it("ADMIN passes only the session org and revalidates after generating", async () => {
    requireSession.mockResolvedValue({ id: "admin", orgId: "org-1", role: "ADMIN" });
    createPrintAgentConfig.mockResolvedValue({ rawKey: "selector.secret" });
    await expect(createPrintServerAction({ serverName: "Mini PC" })).resolves.toEqual({ rawKey: "selector.secret" });
    expect(createPrintAgentConfig).toHaveBeenCalledWith("org-1", { serverName: "Mini PC" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings/print-server");
  });
});
