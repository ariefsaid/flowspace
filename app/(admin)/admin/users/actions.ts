"use server";
/**
 * Admin user-management actions (I-047).
 *
 * [SEC] Every action re-checks ADMIN server-side (even though middleware +
 * the /admin layout also gate the surface) and resolves `orgId` from the
 * session ONLY — the client never supplies it. Every repository write is
 * org-scoped, so a target id from another org resolves to NOT_FOUND before
 * any write (the same tenancy guard as every other admin surface).
 */
import { requireSession } from "@/lib/auth/session";
import {
  updateUser,
  archiveUser,
  adjustCredits,
  findById,
  type UpdateUserInput,
  type AdjustCreditsInput,
} from "@/lib/db/users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppUser } from "@/lib/db/schema";

async function requireAdmin() {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

/**
 * ADMIN-only: edit a same-org user's name / role / membership tier.
 *
 * [SEC] A `role` change must propagate to the Supabase Auth JWT
 * (`app_metadata.role`) — middleware/session resolution trusts that claim
 * for the FIRST request of a session, so without this a promoted ADMIN
 * can't actually reach /admin (and a demoted one doesn't lose access) until
 * their next login re-issues the JWT. The `app_users` row stays the
 * AUTHORITATIVE source (every subsequent request re-resolves the session
 * from it — `getSessionUser`, lib/auth/session.ts); this sync is best-effort
 * on top of that, with a clear, distinct error if the Auth admin API call
 * itself fails (never silently swallowed — the DB write already succeeded,
 * so the caller needs to know the claim may now be stale).
 */
export async function updateUserAction(id: string, input: UpdateUserInput): Promise<AppUser> {
  const admin = await requireAdmin();
  const updated = await updateUser(admin.orgId, id, input);

  if (input.role !== undefined && updated.authUserId) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(updated.authUserId, {
      // Both keys are sent explicitly (not just `role`) — the admin API's
      // app_metadata merge behavior isn't something this code should rely
      // on; org_id is re-derived from the (already org-scoped) updated row,
      // never from client input.
      app_metadata: { role: updated.role, org_id: updated.orgId },
    });
    if (error) throw new Error("ROLE_METADATA_SYNC_FAILED");
  }

  return updated;
}

/** ADMIN-only: soft-archive a same-org user (never hard-delete; refuses an ADMIN target). */
export async function archiveUserAction(id: string): Promise<AppUser> {
  const admin = await requireAdmin();
  return archiveUser(admin.orgId, id);
}

/** ADMIN-only [MONEY]: adjust a same-org user's time-credit / print balance. */
export async function adjustCreditsAction(
  id: string,
  input: AdjustCreditsInput,
): Promise<{ timeCredits: number; printBalance: number }> {
  const admin = await requireAdmin();
  return adjustCredits(admin.orgId, id, input);
}

/** [SEC] Matches signupAction's own floor (app/(public)/signup/actions.ts). */
const MIN_PASSWORD_LENGTH = 6;

/**
 * ADMIN-only password reset [SEC]. The new password is set via the Supabase
 * Auth admin API (service-role key, server-only — `lib/supabase/admin.ts`);
 * it is NEVER logged, echoed, or included in the return value. The target
 * user is resolved WITHIN the admin's own org first (`findById` is
 * org-scoped) — a cross-org id resolves to NOT_FOUND before any Supabase
 * Auth call is even made.
 */
export async function resetUserPasswordAction(
  id: string,
  newPassword: string,
): Promise<{ ok: true }> {
  const admin = await requireAdmin();
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error("PASSWORD_TOO_SHORT");
  }
  const target = await findById(admin.orgId, id);
  if (!target) throw new Error("NOT_FOUND");
  if (!target.authUserId) throw new Error("NO_AUTH_LINK");

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(target.authUserId, {
    password: newPassword,
  });
  if (error) throw new Error("PASSWORD_RESET_FAILED");

  return { ok: true };
}
