"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { organizations } from "@/lib/db/schema";
import { findByEmail, createMember } from "@/lib/db/users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Server action: create a new MEMBER account in the single org (ADR-0014 §1).
 *
 * Identity is owned by Supabase Auth: the admin API mints the `auth.users` row
 * (Supabase hashes the password — there is NO application password column) and
 * sets the `role`/`org_id` app-metadata claims that the edge gate + RLS read. We
 * then insert the linked `app_users` profile carrying `auth_user_id`, in the same
 * request — the `auth_user_id`/`email` unique constraints are the integrity
 * backstop. The component signs the user in client-side after success.
 *
 * Returns { ok: true } on success, or { error: string } on validation failure or
 * duplicate email.
 *
 * AC-004 (auth user + linked MEMBER created; role/org_id app-metadata).
 * AC-005 (duplicate rejected — Supabase "already registered" OR the unique constraint).
 */
export async function signupAction(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: true } | { error: string }> {
  const email = input.email.toLowerCase().trim();

  if (input.password.length < 6) {
    return { error: "Kata sandi minimal 6 karakter." };
  }

  // AC-005 — the spec permits revealing account existence at signup (a fresh
  // user needs to know the email is taken), so the duplicate message is explicit
  // here. (The login path, by contrast, stays non-enumerating.)
  if (await findByEmail(email)) {
    return { error: "Email sudah terdaftar." };
  }

  const slug = process.env.SEED_ORG_SLUG ?? "flowspace";
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) {
    throw new Error(`Organisation "${slug}" not found`);
  }

  // Mint the Supabase auth.users row + mirror role/org_id as JWT app-metadata
  // claims (the edge gate and RLS read these claims). email_confirm:true gives
  // I-004 parity (signup → signed in; ADR-0014, dev/test). Supabase returns an
  // "already registered" error for a duplicate email → the same generic message.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    app_metadata: { role: "MEMBER", org_id: org.id },
  });

  if (error || !data.user) {
    if (isAlreadyRegistered(error)) {
      return { error: "Email sudah terdaftar." };
    }
    throw new Error(error?.message ?? "Gagal membuat akun.");
  }

  // TOCTOU: the findByEmail check above can race a concurrent signup. The DB's
  // unique(email)/unique(auth_user_id) constraints (23505) are the real guard —
  // map the violation to the same duplicate error so both paths are
  // indistinguishable to the caller.
  //
  // M-3 (transactional): if the profile insert fails for ANY reason after the
  // auth user was just created, we DELETE that auth user so no orphan identity
  // is left behind (an auth.users row with no app_users profile). The FK
  // app_users_auth_user_fk (0001) is what makes a dangling auth row an orphan
  // risk in the first place — this cleanup is the counterpart.
  try {
    await createMember({
      orgId: org.id,
      authUserId: data.user.id,
      email,
      name: input.name.trim(),
    });
  } catch (e) {
    await admin.auth.admin.deleteUser(data.user.id);
    if (isUniqueViolation(e)) {
      return { error: "Email sudah terdaftar." };
    }
    throw e;
  }

  return { ok: true };
}

/** A Supabase Auth "email already registered" failure (any of its shapes). */
function isAlreadyRegistered(
  error: { message?: string; code?: string; status?: number } | null,
): boolean {
  if (!error) return false;
  if (error.code === "email_exists" || error.code === "user_already_exists")
    return true;
  if (error.status === 422 && /already registered|already exists/i.test(error.message ?? ""))
    return true;
  return false;
}

/** A Postgres unique_violation (23505) anywhere in the error cause chain. */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ("code" in err && (err as { code: unknown }).code === "23505") return true;
  if ("cause" in err) return isUniqueViolation((err as { cause: unknown }).cause);
  return false;
}
