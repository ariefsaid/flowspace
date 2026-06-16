"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { organizations } from "@/lib/db/schema";
import { findByEmail, createMember } from "@/lib/db/users";

/**
 * Server action: create a new MEMBER account in the single org.
 *
 * Returns { ok: true } on success, or { error: string } on validation failure
 * or duplicate email. The caller (signup page) signs the user in after success.
 *
 * AC-004 (member created; no password column — Supabase Auth owns credentials ADR-0014)
 * AC-005 (duplicate rejected).
 *
 * NOTE (I-005 Phase 2→3 bridge): authUserId uses a placeholder UUID until Phase 3
 * wires the Supabase Auth admin API to mint a real auth.users row.
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

  // TOCTOU: the findByEmail check above can race a concurrent signup. The DB's
  // unique(email) constraint (23505) is the real guard — map the violation to
  // the same duplicate error so both paths are indistinguishable to the caller.
  try {
    // authUserId will be the Supabase auth.users uuid in Phase 3. Placeholder
    // value used here so the schema compiles until Phase 3 wires Supabase Auth.
    await createMember({
      orgId: org.id,
      email,
      name: input.name.trim(),
      authUserId: crypto.randomUUID(),
    });
  } catch (e) {
    // postgres-js wraps the underlying PostgresError. Walk the cause chain to
    // find a 23505 (unique_violation) at any level (ADR-0015, TOCTOU guard).
    const isDuplicate = (err: unknown): boolean => {
      if (!err || typeof err !== "object") return false;
      if ("code" in err && (err as { code: unknown }).code === "23505")
        return true;
      if ("cause" in err) return isDuplicate((err as { cause: unknown }).cause);
      return false;
    };
    if (isDuplicate(e)) {
      return { error: "Email sudah terdaftar." };
    }
    throw e;
  }

  return { ok: true };
}
