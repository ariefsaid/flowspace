/**
 * Unit tests for the Credentials `authorizeUser` logic (lib/auth/authorize.ts).
 *
 * L3 (timing enumeration): when the user is missing or archived we still run a
 * bcrypt.compare against a fixed dummy hash, so a wrong-email request takes
 * roughly as long as a wrong-password request and cannot be timed apart.
 *
 * AC-003 — bad credentials (wrong password OR unknown email) both return null;
 *           no session is created; the caller receives the same opaque signal.
 * AC-014 — when authorize() receives no credentials (empty/absent token) it returns
 *           null → the middleware denies and redirects to /login.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/lib/db/users", () => ({
  findByEmail: vi.fn(),
}));

import { findByEmail } from "@/lib/db/users";
import { authorizeUser } from "@/lib/auth/authorize";

const mockFind = vi.mocked(findByEmail);

const realHash = bcrypt.hashSync("correct-horse", 10);

beforeEach(() => {
  vi.restoreAllMocks();
  mockFind.mockReset();
});

describe("authorizeUser", () => {
  // ---------------------------------------------------------------------------
  // AC-014 — no credentials → deny (returns null, middleware redirects to /login)
  // ---------------------------------------------------------------------------
  it("AC-014: returns null when credentials are empty (no token)", async () => {
    expect(await authorizeUser({ email: "", password: "" })).toBeNull();
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("returns the trusted user shape on a correct password", async () => {
    mockFind.mockResolvedValue({
      id: "u1",
      email: "user@x.test",
      name: "User",
      role: "MEMBER",
      orgId: "org1",
      passwordHash: realHash,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const res = await authorizeUser({
      email: "User@X.test",
      password: "correct-horse",
    });

    expect(res).toEqual({
      id: "u1",
      email: "user@x.test",
      name: "User",
      role: "MEMBER",
      orgId: "org1",
    });
  });

  // ---------------------------------------------------------------------------
  // AC-003 — bad credentials always return null (no enumeration)
  // ---------------------------------------------------------------------------
  it("AC-003: returns null on a wrong password (no enumeration)", async () => {
    mockFind.mockResolvedValue({
      id: "u1",
      email: "user@x.test",
      passwordHash: realHash,
      archivedAt: null,
    } as never);

    expect(
      await authorizeUser({ email: "user@x.test", password: "wrong" }),
    ).toBeNull();
  });

  it("AC-003: L3 — runs bcrypt.compare even when the user is missing (timing guard; unknown email → same null)", async () => {
    mockFind.mockResolvedValue(null);
    const compareSpy = vi.spyOn(bcrypt, "compare");

    const res = await authorizeUser({
      email: "nobody@x.test",
      password: "whatever",
    });

    expect(res).toBeNull();
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it("AC-003: L3 — runs bcrypt.compare even when the user is archived (timing guard)", async () => {
    mockFind.mockResolvedValue({
      id: "u1",
      email: "user@x.test",
      passwordHash: realHash,
      archivedAt: new Date(),
    } as never);
    const compareSpy = vi.spyOn(bcrypt, "compare");

    const res = await authorizeUser({
      email: "user@x.test",
      password: "correct-horse",
    });

    expect(res).toBeNull();
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });
});
