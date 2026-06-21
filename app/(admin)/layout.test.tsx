/**
 * Server-side ADMIN guard on the /admin layout (defense-in-depth backing
 * FR-011 / AC-011 — the primary gate is middleware.ts, e2e-owned). Verifies the
 * layout itself denies non-admins and unauthenticated requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSessionUser = vi.fn();
const redirect = vi.fn((path: string) => {
  // Next's redirect() throws to halt rendering — mimic so control stops here.
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: (...a: unknown[]) => getSessionUser(...a),
}));
vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));
// AdminHeader pulls client/layout deps we don't need to render here.
vi.mock("@/components/layout/AdminHeader", () => ({ AdminHeader: () => null }));

import AdminLayout from "./layout";

describe("AdminLayout server-side authz guard", () => {
  beforeEach(() => {
    getSessionUser.mockReset();
    redirect.mockClear();
  });

  it("redirects unauthenticated requests to /login", async () => {
    getSessionUser.mockResolvedValue(null);
    await expect(AdminLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects a MEMBER to their role home (not admin)", async () => {
    getSessionUser.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o" });
    await expect(AdminLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/dashboard",
    );
  });

  it("redirects a BARISTA to their role home (not admin)", async () => {
    getSessionUser.mockResolvedValue({ id: "u", role: "BARISTA", orgId: "o" });
    await expect(AdminLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/barista",
    );
  });

  it("renders for an ADMIN (no redirect)", async () => {
    getSessionUser.mockResolvedValue({ id: "u", role: "ADMIN", orgId: "o" });
    const el = await AdminLayout({ children: "content" });
    expect(redirect).not.toHaveBeenCalled();
    expect(el).toBeTruthy();
  });
});
