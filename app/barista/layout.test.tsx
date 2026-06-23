/**
 * Server-side BARISTA|ADMIN guard on the /barista layout (defense-in-depth,
 * parity with the (admin) guard; primary gate is middleware.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSessionUser = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));
vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));
vi.mock("@/components/layout", () => ({ MemberHeader: () => null }));

import BaristaLayout from "./layout";

describe("BaristaLayout server-side authz guard", () => {
  beforeEach(() => {
    getSessionUser.mockReset();
    redirect.mockClear();
  });

  it("redirects unauthenticated requests to /login", async () => {
    getSessionUser.mockResolvedValue(null);
    await expect(BaristaLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects a MEMBER to their role home (not barista)", async () => {
    getSessionUser.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o" });
    await expect(BaristaLayout({ children: null })).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("renders for a BARISTA (no redirect)", async () => {
    getSessionUser.mockResolvedValue({ id: "u", role: "BARISTA", orgId: "o" });
    const el = await BaristaLayout({ children: "content" });
    expect(redirect).not.toHaveBeenCalled();
    expect(el).toBeTruthy();
  });

  it("renders for an ADMIN (barista surface is admin-accessible)", async () => {
    getSessionUser.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o" });
    const el = await BaristaLayout({ children: "content" });
    expect(redirect).not.toHaveBeenCalled();
    expect(el).toBeTruthy();
  });
});
