/**
 * Repository: AppUser
 *
 * All reads/writes are server-side via Drizzle over Supabase Postgres (ADR-0015).
 * Every org-scoped function takes `orgId` derived from the server session —
 * the client NEVER supplies it (ADR-0004).
 */
import { and, eq, isNull, asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { appUsers, type AppUser } from "@/lib/db/schema";
import type { MembershipTier } from "@/lib/db/enums";

/**
 * Login lookup. Email is globally unique in the single-venue MVP so this
 * query is intentionally NOT org-scoped. Do NOT expose this to the client.
 *
 * Normalizes (trim + lowercase) before matching the case-sensitive email
 * unique index — the same normalization `createMember`/`findMemberByEmail`
 * apply at write/lookup, so a mixed-case input never misses a lowercase-
 * stored row [SEC].
 */
export async function findByEmail(email: string): Promise<AppUser | null> {
  const normalized = email.trim().toLowerCase();
  const [u] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.email, normalized))
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
 * Minimal profile lookup (id/name/email/tier) for a set of user ids within the
 * org. Used by admin surfaces (pending payments, bookings) to attach the
 * member display name to a booking row without selecting credential columns.
 * Org-scoped: ids from another org never match. Returns [] for an empty input.
 *
 * [SEC][POOL] `dbLike` — pass the caller's Drizzle tx when this is called
 * from INSIDE a `db.transaction` (e.g. `createOrder`'s cafe-discount
 * eligibility, I-044 fix round 2). A plain `db.select()` here would check
 * out a SECOND connection from the SAME pool the caller's transaction
 * already holds one of — under contention, a genuine pool-exhaustion
 * deadlock (the exact class documented on `getTierDiscounts`, I-040).
 */
export async function findProfilesByIds(
  orgId: string,
  ids: string[],
  dbLike: Pick<typeof db, "select"> = db,
): Promise<
  { id: string; name: string; email: string; membershipTier: MembershipTier }[]
> {
  if (!ids.length) return [];
  return dbLike
    .select({
      id: appUsers.id,
      name: appUsers.name,
      email: appUsers.email,
      membershipTier: appUsers.membershipTier,
    })
    .from(appUsers)
    .where(and(eq(appUsers.orgId, orgId), inArray(appUsers.id, ids)));
}

/**
 * Org-scoped minimal member lookup by email (I-044, POS FR-725/726).
 * Returns only the fields the cashier surface needs — never credential
 * columns. Scoped to `orgId` + `role=MEMBER` + non-archived, so a same-email
 * row in another org, or a non-member/archived row, never matches
 * (NFR-044-02: no cross-org disclosure).
 */
export async function findMemberByEmail(
  orgId: string,
  email: string,
): Promise<{ id: string; name: string; email: string; membershipTier: MembershipTier; role: AppUser["role"] } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const [u] = await db
    .select({
      id: appUsers.id,
      name: appUsers.name,
      email: appUsers.email,
      membershipTier: appUsers.membershipTier,
      role: appUsers.role,
    })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.orgId, orgId),
        eq(appUsers.email, normalized),
        eq(appUsers.role, "MEMBER"),
        isNull(appUsers.archivedAt),
      ),
    )
    .limit(1);
  return u ?? null;
}

/**
 * Signup path: creates a MEMBER in the given org, linked to a Supabase auth.users row.
 * Password is managed by Supabase Auth — no password column on app_users (AC-023, ADR-0014 §1).
 *
 * Lowercases `email` at write (defence-in-depth — the signup action already
 * lowercases before calling this) so every stored row is normalized and
 * every lookup (`findByEmail`/`findMemberByEmail`, both of which also
 * lowercase) stays consistent regardless of caller casing [SEC].
 */
export async function createMember(input: {
  orgId: string;
  authUserId: string;
  email: string;
  name: string;
  phone?: string | null;
}): Promise<AppUser> {
  const [u] = await db
    .insert(appUsers)
    .values({
      orgId: input.orgId,
      authUserId: input.authUserId,
      email: input.email.trim().toLowerCase(),
      name: input.name,
      phone: input.phone?.trim() || null,
      role: "MEMBER",
    })
    .returning();
  return u;
}
