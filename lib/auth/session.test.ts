/**
 * Unit tests for lib/auth/session.ts — the server-side session/orgId seam on the
 * Supabase stack (ADR-0014 §2).
 *
 * `getSessionUser`/`requireSession` keep their exact return shape
 * `{ id, role, orgId, email, name }`. Internally they now read the Supabase
 * session server-side (`auth.getUser()` — network-validated, the safe check at a
 * trust boundary) and resolve the linked `app_users` profile via
 * `findByAuthUserId`. We mock both so this is pure seam logic — no live session,
 * no DB. The authoritative `orgId`/`role` come from the profile row, never a
 * client-supplied/forgeable value.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser },
  })),
}));

vi.mock("@/lib/db/users", () => ({
  findByAuthUserId: vi.fn(),
}));

import { findByAuthUserId } from "@/lib/db/users";
import { getSessionUser, requireSession } from "@/lib/auth/session";

const mockFindByAuthUserId = vi.mocked(findByAuthUserId);

const authUser = { id: "auth-uuid", email: "u@x.test" };

const profile = {
  id: "u1",
  orgId: "org1",
  authUserId: "auth-uuid",
  email: "u@x.test",
  name: "User",
  role: "MEMBER" as const,
  membershipTier: "REGULAR" as const,
  timeCredits: 0,
  printBalance: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};

const expectedSessionUser = {
  id: "u1",
  role: "MEMBER",
  orgId: "org1",
  email: "u@x.test",
  name: "User",
};

beforeEach(() => {
  getUser.mockReset();
  mockFindByAuthUserId.mockReset();
});

describe("getSessionUser", () => {
  it("returns the trusted user when a Supabase session + linked profile exist", async () => {
    getUser.mockResolvedValue({ data: { user: authUser } });
    mockFindByAuthUserId.mockResolvedValue(profile);
    expect(await getSessionUser()).toEqual(expectedSessionUser);
    expect(mockFindByAuthUserId).toHaveBeenCalledWith("auth-uuid");
  });

  it("returns null when there is no Supabase session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await getSessionUser()).toBeNull();
    expect(mockFindByAuthUserId).not.toHaveBeenCalled();
  });

  it("returns null when the auth user has no linked app_users profile", async () => {
    getUser.mockResolvedValue({ data: { user: authUser } });
    mockFindByAuthUserId.mockResolvedValue(null);
    expect(await getSessionUser()).toBeNull();
  });
});

describe("requireSession", () => {
  it("returns the user when authenticated", async () => {
    getUser.mockResolvedValue({ data: { user: authUser } });
    mockFindByAuthUserId.mockResolvedValue(profile);
    expect(await requireSession()).toEqual(expectedSessionUser);
  });

  it("throws UNAUTHENTICATED when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireSession()).rejects.toThrow("UNAUTHENTICATED");
  });
});
