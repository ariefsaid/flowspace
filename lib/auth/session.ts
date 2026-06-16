/**
 * Server-side session helpers (ADR-0004 §2).
 *
 * The `orgId` carried here is the trusted, server-resolved tenant scope that
 * repository reads/writes (`lib/db/*`) must use — the client never supplies it.
 * This module imports `lib/auth.ts` (Node runtime); never import it from the
 * Edge middleware.
 */
import { auth } from "@/lib/auth";

/** The trusted session user, or null when there is no session. */
export async function getSessionUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Returns the trusted session user, throwing if unauthenticated.
 * Use in route handlers / server actions before any org-scoped work.
 */
export async function requireSession() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user; // { id, role, orgId, email, name }
}
