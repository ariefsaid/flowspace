/**
 * Unit tests for lib/auth/session.ts — the server-side session/orgId seam.
 *
 * Both helpers wrap NextAuth's `auth()`; we mock it to exercise the
 * authenticated and unauthenticated paths without a live session.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { getSessionUser, requireSession } from "@/lib/auth/session";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  mockAuth.mockReset();
});

const sessionUser = {
  id: "u1",
  email: "u@x.test",
  name: "User",
  role: "MEMBER" as const,
  orgId: "org1",
};

describe("getSessionUser", () => {
  it("returns the user when a session exists", async () => {
    mockAuth.mockResolvedValue({ user: sessionUser } as never);
    expect(await getSessionUser()).toEqual(sessionUser);
  });

  it("returns null when there is no session", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null when the session has no user", async () => {
    mockAuth.mockResolvedValue({} as never);
    expect(await getSessionUser()).toBeNull();
  });
});

describe("requireSession", () => {
  it("returns the user when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: sessionUser } as never);
    expect(await requireSession()).toEqual(sessionUser);
  });

  it("throws UNAUTHENTICATED when there is no session", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(requireSession()).rejects.toThrow("UNAUTHENTICATED");
  });
});
