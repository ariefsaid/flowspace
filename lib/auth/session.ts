/**
 * Server-side session helpers (ADR-0004 §2 / ADR-0014 §2).
 *
 * The `orgId` carried here is the trusted, server-resolved tenant scope that
 * repository reads/writes (`lib/db/*`) must use — the client never supplies it.
 * The session is read from Supabase Auth via `auth.getUser()` (network-validated
 * — the documented safe check at a trust boundary; never trust an unverified
 * cookie here), then the linked `app_users` profile is resolved to attach the
 * authoritative `role`/`orgId`. Node runtime; never import from the Edge
 * middleware (the middleware has its own cookie-bridged client).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findByAuthUserId } from "@/lib/db/users";
import { toSessionUser, type SessionUser } from "@/lib/auth/session-claims";

/** The trusted session user, or null when there is no (linked) session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const profile = await findByAuthUserId(user.id);
  return toSessionUser(user, profile);
}

/**
 * Returns the trusted session user, throwing if unauthenticated.
 * Use in route handlers / server actions before any org-scoped work.
 */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user; // { id, role, orgId, email, name }
}
