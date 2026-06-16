/**
 * Pure session-claims mapper (AC-020) — owns the logic the NextAuth jwt/session
 * callbacks used to (ADR-0014 §2). Given a Supabase auth user and the linked
 * `app_users` profile, it produces the trusted server-resolved session shape the
 * app consumes.
 *
 * The exposed `id` is the **domain** id (`app_users.id`) the org-scoped
 * repository keys on — never the `auth.users` uuid. `role`/`orgId` come from the
 * profile row (the authoritative source of truth), not the JWT claim, so the
 * session can never be forged client-side.
 */
import type { AppUser } from "@/lib/db/schema";
import type { Role } from "@/lib/db/enums";

export type SessionUser = {
  id: string;
  role: Role;
  orgId: string;
  email: string;
  name: string;
};

export function toSessionUser(
  authUser: { id: string; email?: string | null },
  profile: AppUser | null,
): SessionUser | null {
  if (!profile) return null;
  return {
    id: profile.id,
    role: profile.role,
    orgId: profile.orgId,
    email: profile.email,
    name: profile.name,
  };
}
