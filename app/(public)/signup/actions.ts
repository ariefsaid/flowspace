"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
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

  // AC-005 — the spec permits revealing account existence at signup (a fresh
  // user needs to know the email is taken), so the duplicate message is explicit
  // here. (The login path, by contrast, stays non-enumerating.)
  if (await findByEmail(email)) {
    return { error: "Email sudah terdaftar." };
  }

  const slug = process.env.SEED_ORG_SLUG ?? "flowspace";
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug } });

  const passwordHash = await bcrypt.hash(input.password, 10); // NFR-001

  // TOCTOU: the findByEmail check above can race a concurrent signup. The DB's
  // unique(email) constraint is the real guard — map its violation (P2002) to
  // the same duplicate error so both paths are indistinguishable to the caller.
  try {
    await createMember({
      orgId: org.id,
      email,
      name: input.name.trim(),
      passwordHash,
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { error: "Email sudah terdaftar." };
    }
    throw e;
  }

  return { ok: true };
}
