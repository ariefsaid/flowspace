/**
 * Repository: AppUser
 *
 * All reads/writes are server-side via Drizzle over Supabase Postgres (ADR-0015).
 * Every org-scoped function takes `orgId` derived from the server session —
 * the client NEVER supplies it (ADR-0004).
 */
import { and, eq, isNull, ne, asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { appUsers, type AppUser } from "@/lib/db/schema";
import { ROLES, MEMBERSHIP_TIERS, type MembershipTier, type Role } from "@/lib/db/enums";
import {
  adjustTimeCreditsForAdmin,
  assertValidCreditDelta,
  int4ClampedAdd,
} from "@/lib/db/time-credit-lots";

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
 *
 * [SEC][I-047] Excludes an archived row: an admin's `archiveUser` is meant to
 * revoke access, not just hide the account from the directory — without this
 * filter, an archived member/admin's existing Supabase Auth session would
 * still resolve a full `SessionUser` here and keep working normally.
 */
export async function findByAuthUserId(
  authUserId: string
): Promise<AppUser | null> {
  const [u] = await db
    .select()
    .from(appUsers)
    .where(and(eq(appUsers.authUserId, authUserId), isNull(appUsers.archivedAt)))
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
}): Promise<AppUser> {
  const [u] = await db
    .insert(appUsers)
    .values({
      orgId: input.orgId,
      authUserId: input.authUserId,
      email: input.email.trim().toLowerCase(),
      name: input.name,
      role: "MEMBER",
    })
    .returning();
  return u;
}

// ---------------------------------------------------------------------------
// Admin user-management (I-047) [SEC] — every function is org-scoped; the
// ADMIN check itself lives at the action layer (app/(admin)/admin/users/actions.ts),
// mirroring every other admin repository (bookings/print/cafe).
// ---------------------------------------------------------------------------

export type UpdateUserInput = {
  name?: string;
  role?: Role;
  membershipTier?: MembershipTier;
};

/**
 * Admin edit: name / role / membership tier. Partial — only the given fields
 * change. [SEC] `role`/`membershipTier` are runtime-validated against the
 * enum (never trusted/coerced from an arbitrary string); a cross-org id
 * resolves to NOT_FOUND before any write, and an already-archived row is
 * excluded (edit a live account only).
 */
export async function updateUser(
  orgId: string,
  id: string,
  input: UpdateUserInput,
): Promise<AppUser> {
  const values: Partial<typeof appUsers.$inferInsert> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("INVALID_NAME");
    values.name = trimmed;
  }
  if (input.role !== undefined) {
    if (!ROLES.includes(input.role)) throw new Error("INVALID_ROLE");
    values.role = input.role;
  }
  if (input.membershipTier !== undefined) {
    if (!MEMBERSHIP_TIERS.includes(input.membershipTier)) throw new Error("INVALID_TIER");
    values.membershipTier = input.membershipTier;
  }

  const [updated] = await db
    .update(appUsers)
    .set(values)
    .where(and(eq(appUsers.id, id), eq(appUsers.orgId, orgId), isNull(appUsers.archivedAt)))
    .returning();
  if (!updated) throw new Error("NOT_FOUND");
  return updated;
}

/**
 * Soft-archive (never hard-delete — sets `archivedAt`, excluded from every
 * `isNull(archivedAt)` read: `findById`/`listByOrg`/`findMemberByEmail`, and
 * now `findByAuthUserId` — so an archived user's existing session stops
 * resolving too). [SEC] Refuses to archive an ADMIN-role user (ORIG's
 * "Cannot delete admin users" rule) — an org must always keep its admins
 * archivable only by demoting the role first, never by this path. A
 * cross-org id resolves to NOT_FOUND before any write.
 *
 * [SEC][I-047 minor] The role check above is a plain (unlocked) pre-read —
 * a concurrent `updateUser` promoting this SAME id to ADMIN could commit
 * strictly between it and this function's own UPDATE. The UPDATE's WHERE
 * therefore re-checks `role != 'ADMIN'` itself (a real compare-and-set
 * against whatever the row's role is AT THE MOMENT this statement actually
 * runs, not the earlier snapshot) — a promotion that lands in that window
 * makes this UPDATE match zero rows, and the fallback below re-reads to
 * report CANNOT_ARCHIVE_ADMIN rather than the generic NOT_FOUND a plain CAS
 * miss would otherwise imply.
 */
export async function archiveUser(orgId: string, id: string): Promise<AppUser> {
  const [target] = await db
    .select({ id: appUsers.id, role: appUsers.role })
    .from(appUsers)
    .where(and(eq(appUsers.id, id), eq(appUsers.orgId, orgId), isNull(appUsers.archivedAt)))
    .limit(1);
  if (!target) throw new Error("NOT_FOUND");
  if (target.role === "ADMIN") throw new Error("CANNOT_ARCHIVE_ADMIN");

  const [updated] = await db
    .update(appUsers)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(appUsers.id, id),
        eq(appUsers.orgId, orgId),
        isNull(appUsers.archivedAt),
        ne(appUsers.role, "ADMIN"),
      ),
    )
    .returning();
  if (!updated) {
    const [existing] = await db
      .select({ role: appUsers.role })
      .from(appUsers)
      .where(and(eq(appUsers.id, id), eq(appUsers.orgId, orgId)))
      .limit(1);
    throw new Error(existing?.role === "ADMIN" ? "CANNOT_ARCHIVE_ADMIN" : "NOT_FOUND");
  }
  return updated;
}

export type AdjustCreditsInput = {
  timeCreditsDelta?: number;
  printBalanceDelta?: number;
};

/**
 * Admin manual balance adjustment [SEC][MONEY] — atomic, both deltas applied
 * (or neither, on any failure) in one transaction, each independently
 * clamped so a balance never goes negative.
 *
 * `printBalance` is a plain counter (no ledger table, per the schema note on
 * `app_users`) — adjusted with a single clamped SQL increment
 * (`GREATEST(col + delta, 0)`).
 *
 * `timeCredits` is a DERIVED CACHE of the member's `time_credit_lots`
 * (I-040) — a direct column write here would be silently overwritten by the
 * next real spend/purchase's `recomputeCreditCache`. `adjustTimeCreditsForAdmin`
 * (lib/db/time-credit-lots.ts) owns the lot-correct grant/debit and itself
 * recomputes the cache.
 *
 * Org-scoped: a cross-org (or already-archived) id resolves to NOT_FOUND
 * before any write.
 */
export async function adjustCredits(
  orgId: string,
  id: string,
  input: AdjustCreditsInput,
): Promise<{ timeCredits: number; printBalance: number }> {
  const timeCreditsDelta = input.timeCreditsDelta ?? 0;
  const printBalanceDelta = input.printBalanceDelta ?? 0;
  // [SEC][MONEY][I-047 fix-3] Finite integer within the int4/business-cap
  // bound (see time-credit-lots.ts's assertValidCreditDelta) — validated
  // BEFORE the transaction opens, so an out-of-range delta never even
  // attempts a write. `printBalanceDelta` reuses the same guard: it isn't
  // hours, but it lands in the same `integer` column with the same raw
  // Postgres overflow risk, so the same bound applies.
  assertValidCreditDelta(timeCreditsDelta);
  assertValidCreditDelta(printBalanceDelta);

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(and(eq(appUsers.id, id), eq(appUsers.orgId, orgId), isNull(appUsers.archivedAt)))
      .limit(1);
    if (!target) throw new Error("NOT_FOUND");

    // [SEC][MONEY][I-047 fix-4] Lock-order deadlock fix: `time_credit_lots`
    // MUST be touched (if at all) BEFORE `app_users` in every credit-writing
    // transaction — the SAME canonical order `spendTimeCredits`/
    // `recomputeCreditCache` already use on the booking/checkout side
    // (time-credit-lots.ts). The old code did the printBalance UPDATE
    // (locks app_users) FIRST, then adjustTimeCreditsForAdmin (locks lots)
    // second — the exact REVERSE of booking/checkout's order. Two
    // transactions acquiring the same pair of resources in opposite orders
    // is the textbook lock-order deadlock: a concurrent adjustCredits (old
    // order: app_users→lots) and spendTimeCredits (lots→app_users) on the
    // SAME user could each hold one resource while waiting on the other —
    // proven by a real Postgres "deadlock detected" (40P01) under a forced-
    // overlap barrier test (lib/db/credit-lock-order.int.test.ts). Doing the
    // lots-touching work FIRST here (before the printBalance write) makes
    // app_users always the LAST resource this transaction locks, matching
    // every other credit path.
    if (timeCreditsDelta !== 0) {
      await adjustTimeCreditsForAdmin({ orgId, userId: id, deltaHours: timeCreditsDelta, tx });
    }

    if (printBalanceDelta !== 0) {
      await tx
        .update(appUsers)
        .set({
          // [SEC][MONEY][I-047 fix-3] int4-clamped increment — clamps the
          // RESULT, not just the delta (see int4ClampedAdd).
          printBalance: int4ClampedAdd(appUsers.printBalance, printBalanceDelta),
          updatedAt: new Date(),
        })
        .where(and(eq(appUsers.id, id), eq(appUsers.orgId, orgId)));
    }

    const [final] = await tx
      .select({ timeCredits: appUsers.timeCredits, printBalance: appUsers.printBalance })
      .from(appUsers)
      .where(and(eq(appUsers.id, id), eq(appUsers.orgId, orgId)))
      .limit(1);
    return final!;
  });
}
