import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireSession, purchasePrintTopup, purchasePackage } = vi.hoisted(() => ({ requireSession: vi.fn(), purchasePrintTopup: vi.fn(), purchasePackage: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("@/lib/db/print-packages", () => ({ purchasePrintTopup }));
vi.mock("@/lib/db/packages", () => ({ purchasePackage }));

import { topUpPrintAction, purchasePackageAction } from "./actions";

describe("topup actions", () => {
  beforeEach(() => { requireSession.mockReset(); purchasePrintTopup.mockReset(); purchasePackage.mockReset(); });
  it("sends only packageId plus server session scope to print purchase", async () => {
    requireSession.mockResolvedValue({ id: "member", orgId: "org-1", role: "MEMBER" });
    await topUpPrintAction("pkg-10");
    expect(purchasePrintTopup).toHaveBeenCalledWith({ orgId: "org-1", userId: "member", packageId: "pkg-10" });
  });
  it("keeps time-credit package purchase unchanged", async () => {
    requireSession.mockResolvedValue({ id: "member", orgId: "org-1", role: "MEMBER" });
    await purchasePackageAction("time-10");
    expect(purchasePackage).toHaveBeenCalledWith({ orgId: "org-1", userId: "member", packageId: "time-10" });
  });
});
