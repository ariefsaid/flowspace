"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { findByEmail, createMember } from "@/lib/db/users";

/**
 * Server action: create a new MEMBER account in the single org.
 *
 * Returns { ok: true } on success, or { error: string } on validation failure
 * or duplicate email. The caller (signup page) signs the user in after success.
 *
 * AC-004 (member created with bcrypt hash) + AC-005 (duplicate rejected).
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

  if (await findByEmail(email)) {
    return { error: "Email sudah terdaftar." }; // AC-005 — no enumeration: same generic wording
  }

  const slug = process.env.SEED_ORG_SLUG ?? "flowspace";
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug } });

  const passwordHash = await bcrypt.hash(input.password, 10); // NFR-001

  await createMember({
    orgId: org.id,
    email,
    name: input.name.trim(),
    passwordHash,
  });

  return { ok: true };
}
