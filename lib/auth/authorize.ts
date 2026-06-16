/**
 * Credentials `authorize` logic, isolated from the NextAuth factory so it can
 * be unit-tested without importing `next/server` (ADR-0003). Node runtime only:
 * it pulls Prisma (via `lib/db/users`) and bcrypt.
 */
import bcrypt from "bcryptjs";
import type { Role } from "@/lib/db/enums";
import { findByEmail } from "@/lib/db/users";

/**
 * A fixed, valid bcrypt hash used purely as a timing decoy (L3). When no user
 * is found (or the user is archived) we still run one bcrypt.compare against
 * this constant, so a wrong-email request costs roughly the same as a
 * wrong-password request and the two cannot be told apart by response time.
 * It is NOT a credential — nothing's password is ever this value in practice.
 */
const DUMMY_BCRYPT_HASH =
  "$2b$10$SLNu7LkD3D7tk5mU9sWuj.MDA5DLJ7C3.tjjsf1.CdK8gRQFeA6KG";

/** The trusted session-user shape returned to NextAuth on a valid login. */
export type AuthorizedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
};

/**
 * Returns the trusted user shape on a correct credential, or null on any
 * failure (empty input, unknown email, archived user, wrong password).
 */
export async function authorizeUser(creds: {
  email?: unknown;
  password?: unknown;
}): Promise<AuthorizedUser | null> {
  const email = String(creds?.email ?? "")
    .toLowerCase()
    .trim();
  const password = String(creds?.password ?? "");
  if (!email || !password) return null;

  const user = await findByEmail(email);
  if (!user || user.archivedAt) {
    // L3 timing guard: spend ~one bcrypt.compare even on the no-user path.
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
    return null;
  }

  // NOTE: passwordHash was removed in I-005 Phase 2 (Drizzle port); authorize.ts
  // is deleted in Phase 6. Until then, fall through as if password doesn't match.
  const storedHash = (user as Record<string, unknown>).passwordHash as
    | string
    | undefined;
  if (!storedHash) return null;
  const ok = await bcrypt.compare(password, storedHash);
  if (!ok) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: user.orgId,
  };
}
