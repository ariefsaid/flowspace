/**
 * Repository: AppUser
 *
 * All reads/writes are server-side via Drizzle over Supabase Postgres (ADR-0015).
 * Every org-scoped function takes `orgId` derived from the server session —
 * the client NEVER supplies it (ADR-0004).
 */
import { and, eq, isNull, asc } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { appUsers, type AppUser } from "@/lib/db/schema";

/**
 * Login lookup. Email is globally unique in the single-venue MVP so this
 * query is intentionally NOT org-scoped. Do NOT expose this to the client.
 */
export async function findByEmail(email: string): Promise<AppUser | null> {
  const [u] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.email, email))
    .limit(1);
  return u ?? null;
}

/**
 * Session resolver: find the app_users profile linked to a Supabase auth.users row.
 * Used by getSessionUser() in lib/auth/session.ts (Phase 3).
 */
export async function findByAuthUserId(
  authUserId: string
): Promise<AppUser | null> {
  const [u] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.authUserId, authUserId))
    .limit(1);
  return u ?? null;
}

/**
 * Org-scoped read by id.
 * Returns null for a row that belongs to a different org (cross-org isolation).
 */
export async function findById(
  orgId: string,
  id: string
): Promise<AppUser | null> {
  const [u] = await db
    .select()
    .from(appUsers)
    .where(
      and(
        eq(appUsers.id, id),
        eq(appUsers.orgId, orgId),
        isNull(appUsers.archivedAt)
      )
    )
    .limit(1);
  return u ?? null;
}

/**
 * Org-scoped directory of active (non-archived) users.
 */
export async function listByOrg(orgId: string): Promise<AppUser[]> {
  return db
    .select()
    .from(appUsers)
    .where(and(eq(appUsers.orgId, orgId), isNull(appUsers.archivedAt)))
    .orderBy(asc(appUsers.name));
}

/**
 * Signup path: creates a MEMBER in the given org, linked to a Supabase auth.users row.
 * Password is managed by Supabase Auth — no password column on app_users (AC-023, ADR-0014 §1).
 */
export async function createMember(input: {
  orgId: string;
  authUserId: string;
  email: string;
  name: string;
}): Promise<AppUser> {
  const [u] = await db
    .insert(appUsers)
    .values({
      orgId: input.orgId,
      authUserId: input.authUserId,
      email: input.email,
      name: input.name,
      role: "MEMBER",
    })
    .returning();
  return u;
}
