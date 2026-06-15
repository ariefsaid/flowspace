/**
 * Unit tests for the Credentials `authorizeUser` logic (lib/auth/authorize.ts).
 *
 * L3 (timing enumeration): when the user is missing or archived we still run a
 * bcrypt.compare against a fixed dummy hash, so a wrong-email request takes
 * roughly as long as a wrong-password request and cannot be timed apart.
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
  it("returns null when credentials are empty", async () => {
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

  it("returns null on a wrong password", async () => {
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

  it("L3: runs bcrypt.compare even when the user is missing (timing guard)", async () => {
    mockFind.mockResolvedValue(null);
    const compareSpy = vi.spyOn(bcrypt, "compare");

    const res = await authorizeUser({
      email: "nobody@x.test",
      password: "whatever",
    });

    expect(res).toBeNull();
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it("L3: runs bcrypt.compare even when the user is archived", async () => {
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
