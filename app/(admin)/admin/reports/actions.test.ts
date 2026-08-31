import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSession, getReportsData } = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getReportsData: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: () => requireSession() }));
vi.mock("@/lib/db/reports", () => ({
  getReportsData: (...args: unknown[]) => getReportsData(...args),
}));

import { getReportsAction } from "./actions";

describe("getReportsAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    getReportsData.mockReset();
  });

  it("ADMIN fetches reports scoped to the session org", async () => {
    requireSession.mockResolvedValue({ id: "admin-1", orgId: "org-1", role: "ADMIN" });
    getReportsData.mockResolvedValue({ period: "weekly", revenueTrend: [] });
    const result = await getReportsAction("weekly");
    expect(getReportsData).toHaveBeenCalledWith("org-1", "weekly");
    expect(result).toEqual({ period: "weekly", revenueTrend: [] });
  });

  it("MEMBER and BARISTA are denied before the repository call", async () => {
    for (const role of ["MEMBER", "BARISTA"] as const) {
      requireSession.mockResolvedValue({ id: "u", orgId: "org-1", role });
      await expect(getReportsAction("daily")).rejects.toThrow("FORBIDDEN");
    }
    expect(getReportsData).not.toHaveBeenCalled();
  });

  it("rejects an invalid period before the repository call", async () => {
    requireSession.mockResolvedValue({ id: "admin-1", orgId: "org-1", role: "ADMIN" });
    // @ts-expect-error deliberately invalid input
    await expect(getReportsAction("yearly")).rejects.toThrow("INVALID_PERIOD");
    expect(getReportsData).not.toHaveBeenCalled();
  });
});
