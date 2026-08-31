/**
 * Repository: time_credit_lots (I-040, spec 0007). [SEC][MONEY] FIFO
 * expiring-credit spend.
 *
 * `app_users.timeCredits` is a DERIVED CACHE of the sum of non-expired
 * `remainingHours` across a member's lots — never the spend authority
 * (OBS-834/FR-853). Every write here takes the caller's transaction (`tx`)
 * so the lot decrement(s), the cache recompute, and whatever business write
 * triggered the spend (booking create/checkout) commit or roll back
 * together. `spendTimeCredits` throws `INSUFFICIENT_CREDITS` before any
 * debit write when short — the caller's transaction then rolls back the
 * whole thing (including this function's own writes), so AC-823's "no lot/
 * balance/booking/ledger row changes" holds even though the row-lock select
 * and expired-lot prune run before the sufficiency check.
 *
 * Concurrency (AC-825): the lot select takes `FOR UPDATE`, row-locking every
 * candidate lot for the duration of the caller's transaction. Two concurrent
 * spends for the same user serialize on those row locks — the second spend
 * blocks until the first commits or rolls back, then re-reads the (now
 * updated) `remainingHours` before deciding, so combined demand can never
 * jointly overspend past what the lots actually hold.
 */
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { appUsers, timeCreditLots, type TimeCreditLot } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Pure FIFO selection (OBS-825) — no DB access, fully unit-testable.
// ---------------------------------------------------------------------------

export type SpendableLot = {
  id: string;
  remainingHours: number;
  expiresAt: Date;
};

/**
 * Given a member's lots and an hours target, returns the soonest-expiring
 * subset to debit (and how much of each), skipping expired/empty lots.
 * Throws `INVALID_HOURS` for a non-positive request and `INSUFFICIENT_CREDITS`
 * (no partial result) when the usable total falls short.
 */
export function selectLotsToSpend(
  lots: SpendableLot[],
  hours: number,
  now: Date = new Date(),
): Array<{ id: string; hoursToDebit: number }> {
  if (!Number.isFinite(hours) || hours <= 0) throw new Error("INVALID_HOURS");

  const usable = lots
    .filter((l) => l.remainingHours > 0 && l.expiresAt.getTime() > now.getTime())
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

  let remaining = hours;
  const picks: Array<{ id: string; hoursToDebit: number }> = [];
  for (const lot of usable) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingHours, remaining);
    picks.push({ id: lot.id, hoursToDebit: take });
    remaining -= take;
  }
  if (remaining > 0) throw new Error("INSUFFICIENT_CREDITS");
  return picks;
}

// ---------------------------------------------------------------------------
// assertValidCreditDelta [SEC][MONEY][I-047 fix-3] — shared int4/business-cap
// guard for every manual credit/print-balance delta.
// ---------------------------------------------------------------------------

/** Postgres `integer` column bound — beyond this the DB itself would throw a
 *  raw "value out of range for type integer" error. */
const INT4_MAX = 2_147_483_647;
/** [SEC][MONEY] Coarse business sanity cap on a single manual adjustment
 *  (time-credit hours OR print-balance pages) — far beyond any real admin
 *  grant/debit, but small enough that even a crafted or fat-fingered delta
 *  can never approach the int4 edge, including after being added to an
 *  existing near-max balance (`GREATEST(col + delta, 0)` in adjustCredits). */
const MAX_CREDIT_DELTA = 1_000_000;

/**
 * Validates a single manual credit/print-balance delta [SEC][MONEY] — a
 * finite integer within `±MAX_CREDIT_DELTA` (which is itself far inside the
 * Postgres `integer` column bound, `INT4_MAX`). Throws `INVALID_DELTA`
 * otherwise, including for `NaN`/`Infinity` (never silently treated as a
 * zero/no-op — the caller must see a clear rejection, not a masked bug).
 * Shared by `adjustCredits` (users.ts, validated BEFORE its transaction
 * opens) and `adjustTimeCreditsForAdmin` below (defense-in-depth — this
 * function is directly callable without going through `adjustCredits`).
 */
export function assertValidCreditDelta(delta: number): void {
  if (!Number.isFinite(delta) || !Number.isInteger(delta)) throw new Error("INVALID_DELTA");
  if (delta > MAX_CREDIT_DELTA || delta < -MAX_CREDIT_DELTA) throw new Error("INVALID_DELTA");
  // Belt-and-braces: MAX_CREDIT_DELTA is already « INT4_MAX, but keep the
  // int4 bound itself explicit so this function's contract doesn't silently
  // depend on the business cap alone if that constant is ever loosened.
  if (delta > INT4_MAX || delta < -INT4_MAX) throw new Error("INVALID_DELTA");
}

// ---------------------------------------------------------------------------
// spendTimeCredits — the atomic, race-safe debit path [SEC][MONEY]
// ---------------------------------------------------------------------------

export async function spendTimeCredits(opts: {
  orgId: string;
  userId: string;
  hours: number;
  tx: Pick<typeof db, "select" | "update">;
}): Promise<void> {
  const { orgId, userId, hours, tx } = opts;

  // Row-lock every non-empty lot for this member (AC-825 — serializes
  // concurrent spends). Ordered soonest-expiry-first, matching the FIFO
  // selection below.
  const rows = await tx
    .select({
      id: timeCreditLots.id,
      remainingHours: timeCreditLots.remainingHours,
      expiresAt: timeCreditLots.expiresAt,
    })
    .from(timeCreditLots)
    .where(
      and(
        eq(timeCreditLots.orgId, orgId),
        eq(timeCreditLots.userId, userId),
        gt(timeCreditLots.remainingHours, 0),
      ),
    )
    .orderBy(asc(timeCreditLots.expiresAt))
    .for("update");

  // [SEC] `now` is captured AFTER the row lock is acquired, not before —
  // `.for("update")` can BLOCK (a concurrent spend/checkout holding the same
  // row locks). A `now` captured before that wait would still look "not yet
  // expired" for a lot whose expiresAt passed WHILE this call was waiting on
  // the lock, letting a queued spend debit a lot that has, in real time,
  // already expired by the moment it actually gets to look at the row.
  const now = new Date();

  // Prune expired-but-nonzero lots (data hygiene: their remainingHours no
  // longer represents spendable balance). Selection below only ever
  // considers the still-valid rows regardless.
  const expiredIds = rows
    .filter((r) => r.expiresAt.getTime() <= now.getTime())
    .map((r) => r.id);
  if (expiredIds.length > 0) {
    await tx
      .update(timeCreditLots)
      .set({ remainingHours: 0, updatedAt: now })
      .where(and(eq(timeCreditLots.orgId, orgId), inArray(timeCreditLots.id, expiredIds)));
  }

  const activeRows = rows.filter((r) => r.expiresAt.getTime() > now.getTime());
  // Throws INSUFFICIENT_CREDITS before any debit write when short; the
  // caller's transaction rolls back everything (including the prune above).
  const picks = selectLotsToSpend(activeRows, hours, now);

  for (const pick of picks) {
    await tx
      .update(timeCreditLots)
      .set({
        remainingHours: sql`${timeCreditLots.remainingHours} - ${pick.hoursToDebit}`,
        updatedAt: now,
      })
      .where(and(eq(timeCreditLots.id, pick.id), eq(timeCreditLots.orgId, orgId)));
  }

  await recomputeCreditCache({ orgId, userId, tx });
}

// ---------------------------------------------------------------------------
// recomputeCreditCache — derived-balance sync [SEC]
// ---------------------------------------------------------------------------

/** Sets app_users.timeCredits = SUM(remainingHours) of non-expired lots; returns the value. */
export async function recomputeCreditCache(opts: {
  orgId: string;
  userId: string;
  tx: Pick<typeof db, "update" | "select">;
}): Promise<number> {
  const { orgId, userId, tx } = opts;
  const now = new Date();

  const [row] = await tx
    .select({
      total: sql<number>`coalesce(sum(${timeCreditLots.remainingHours}), 0)::int`,
    })
    .from(timeCreditLots)
    .where(
      and(
        eq(timeCreditLots.orgId, orgId),
        eq(timeCreditLots.userId, userId),
        gt(timeCreditLots.expiresAt, now),
      ),
    );
  const total = row?.total ?? 0;

  await tx
    .update(appUsers)
    .set({ timeCredits: total, updatedAt: now })
    .where(and(eq(appUsers.id, userId), eq(appUsers.orgId, orgId)));

  return total;
}

// ---------------------------------------------------------------------------
// adjustTimeCreditsForAdmin [SEC][MONEY] — admin manual grant/debit (I-047)
// ---------------------------------------------------------------------------

/** Same 90-day expiry `purchaseTimeCreditPackage` (packages.ts) grants on a paid lot. */
const ADMIN_GRANT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Admin manual credit adjustment (e.g. compensating a member, correcting an
 * error) — grants or debits hours OUTSIDE the normal purchase/spend flows.
 * `app_users.timeCredits` is a derived cache (see the module doc comment
 * above), so this never writes that column directly:
 *
 * - A positive `deltaHours` inserts a NEW 90-day lot (mirrors
 *   `purchaseTimeCreditPackage`'s grant shape, `packageId`/
 *   `purchaseTransactionId` both null — an admin grant, not a purchase) so it
 *   participates in the same FIFO-expiry pool as purchased credits.
 * - A negative `deltaHours` debits the EXISTING lots FIFO (soonest-expiring
 *   first — the same row-locked read `spendTimeCredits` uses) but — unlike
 *   `spendTimeCredits` — CLAMPS to whatever is actually available rather
 *   than throwing `INSUFFICIENT_CREDITS`: an admin "remove 10h" against a 3h
 *   balance zeroes the balance instead of failing the whole request.
 *
 * Always ends by recomputing the `app_users.timeCredits` cache. Returns the
 * new cache value. MUST be called with the caller's own `tx` (same pooling
 * contract as `spendTimeCredits`/`recomputeCreditCache`).
 */
export async function adjustTimeCreditsForAdmin(opts: {
  orgId: string;
  userId: string;
  deltaHours: number;
  tx: Pick<typeof db, "select" | "update" | "insert">;
}): Promise<number> {
  const { orgId, userId, deltaHours, tx } = opts;

  if (deltaHours === 0) {
    return recomputeCreditCache({ orgId, userId, tx });
  }
  // [SEC][MONEY][I-047 fix-3] Defense-in-depth: `adjustCredits` (users.ts)
  // already validates this BEFORE opening its transaction, but this
  // function is itself exported and directly callable — never trust a
  // caller-supplied delta this close to the DB's raw int4 bound without its
  // own check. Also now rejects a non-finite delta outright (NaN/Infinity
  // used to silently fall through to the recompute-only no-op branch above,
  // masking a caller bug instead of surfacing it).
  assertValidCreditDelta(deltaHours);

  if (deltaHours > 0) {
    const purchasedAt = new Date();
    await tx.insert(timeCreditLots).values({
      orgId,
      userId,
      totalHours: deltaHours,
      remainingHours: deltaHours,
      purchasedAt,
      expiresAt: new Date(purchasedAt.getTime() + ADMIN_GRANT_EXPIRY_MS),
    });
    return recomputeCreditCache({ orgId, userId, tx });
  }

  // Negative delta: debit FIFO, clamped to whatever is actually available —
  // mirrors spendTimeCredits's row-locked read + expired-lot prune, but never
  // throws INSUFFICIENT_CREDITS.
  const rows = await tx
    .select({
      id: timeCreditLots.id,
      remainingHours: timeCreditLots.remainingHours,
      expiresAt: timeCreditLots.expiresAt,
    })
    .from(timeCreditLots)
    .where(
      and(
        eq(timeCreditLots.orgId, orgId),
        eq(timeCreditLots.userId, userId),
        gt(timeCreditLots.remainingHours, 0),
      ),
    )
    .orderBy(asc(timeCreditLots.expiresAt))
    .for("update");

  const now = new Date();
  const expiredIds = rows.filter((r) => r.expiresAt.getTime() <= now.getTime()).map((r) => r.id);
  if (expiredIds.length > 0) {
    await tx
      .update(timeCreditLots)
      .set({ remainingHours: 0, updatedAt: now })
      .where(and(eq(timeCreditLots.orgId, orgId), inArray(timeCreditLots.id, expiredIds)));
  }

  const activeRows = rows.filter((r) => r.expiresAt.getTime() > now.getTime());
  const available = activeRows.reduce((sum, r) => sum + r.remainingHours, 0);
  const want = Math.min(-deltaHours, available);
  if (want > 0) {
    const picks = selectLotsToSpend(activeRows, want, now);
    for (const pick of picks) {
      await tx
        .update(timeCreditLots)
        .set({
          remainingHours: sql`${timeCreditLots.remainingHours} - ${pick.hoursToDebit}`,
          updatedAt: now,
        })
        .where(and(eq(timeCreditLots.id, pick.id), eq(timeCreditLots.orgId, orgId)));
    }
  }

  return recomputeCreditCache({ orgId, userId, tx });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A member's lots, soonest-expiring first (org/member surfaces). */
export function listLots(orgId: string, userId: string): Promise<TimeCreditLot[]> {
  return db
    .select()
    .from(timeCreditLots)
    .where(and(eq(timeCreditLots.orgId, orgId), eq(timeCreditLots.userId, userId)))
    .orderBy(asc(timeCreditLots.expiresAt));
}
