/**
 * Repository: AppUser
 *
 * All reads/writes are server-side. Every org-scoped function takes `orgId`
 * derived from the server session — the client NEVER supplies it (ADR-0004).
 */
import { prisma } from "@/lib/db/client";
import type { AppUser } from "@prisma/client";

/**
 * Login lookup. Email is globally unique in the single-venue MVP so this
 * query is intentionally NOT org-scoped. Do NOT expose this to the client.
 */
export function findByEmail(email: string): Promise<AppUser | null> {
  return prisma.appUser.findUnique({ where: { email } });
}

/**
 * Org-scoped read by id.
 * Returns null for a row that belongs to a different org (cross-org isolation).
 */
export function findById(orgId: string, id: string): Promise<AppUser | null> {
  return prisma.appUser.findFirst({
    where: { id, orgId, archivedAt: null },
  });
}

/**
 * Org-scoped directory of active (non-archived) users.
 */
export function listByOrg(orgId: string): Promise<AppUser[]> {
  return prisma.appUser.findMany({
    where: { orgId, archivedAt: null },
    orderBy: { name: "asc" },
  });
}

/**
 * Signup path: creates a MEMBER in the given org.
 * Caller is responsible for hashing the password before calling this function.
 */
export function createMember(input: {
  orgId: string;
  email: string;
  name: string;
  passwordHash: string;
}): Promise<AppUser> {
  return prisma.appUser.create({
    data: {
      orgId: input.orgId,
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      role: "MEMBER",
    },
  });
}
