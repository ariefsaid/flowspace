/**
 * Unit owner for AC-020 (session carries role + orgId), re-homed from the
 * NextAuth jwt/session callbacks (`lib/auth.config.ts`) to a pure mapper on the
 * Supabase stack (ADR-0014 §2). The mapper turns a Supabase auth user + the
 * linked app_users profile into the trusted `{ id, role, orgId, email, name }`
 * shape the rest of the app consumes — never client-trustable, always resolved
 * from the profile row server-side.
 */
import { describe, expect, it } from "vitest";
import { toSessionUser } from "@/lib/auth/session-claims";
import type { AppUser } from "@/lib/db/schema";

const profile = {
  id: "u1",
  orgId: "org1",
  authUserId: "auth-uuid",
  email: "a@b.c",
  name: "Admin",
  role: "ADMIN",
  membershipTier: "REGULAR",
  timeCredits: 0,
  printBalance: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
} as AppUser;

describe("toSessionUser", () => {
  it("AC-020: maps auth user + profile to { id, role, orgId, email, name }", () => {
    const u = toSessionUser({ id: "auth-uuid", email: "a@b.c" }, profile);
    expect(u).toEqual({
      id: "u1",
      role: "ADMIN",
      orgId: "org1",
      email: "a@b.c",
      name: "Admin",
    });
  });

  it("AC-020: the domain id (app_users.id) — not the auth uuid — is exposed as `id`", () => {
    const u = toSessionUser({ id: "auth-uuid", email: "a@b.c" }, profile);
    // org_id-scoped repository calls key on app_users.id; the auth uuid must not leak through.
    expect(u?.id).toBe("u1");
    expect(u?.id).not.toBe("auth-uuid");
  });

  it("AC-020: returns null when there is no profile row (unlinked auth user)", () => {
    expect(toSessionUser({ id: "x", email: "a@b.c" }, null)).toBeNull();
  });
});
