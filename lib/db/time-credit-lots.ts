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
import { and, asc, eq, gt, inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
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
 *  grant/debit, and it keeps any SINGLE delta well inside the int4 bound.
 *  It does NOT by itself make `col + delta` overflow-proof (an existing
 *  near-max balance plus a valid delta can still exceed INT4_MAX) — that is
 *  the result-side clamp `int4ClampedAdd` / the recompute SUM clamp below.
 */
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

/**
 * [SEC][MONEY][I-047 fix-3] int4-safe balance-increment expression —
 * `least(greatest((col)::bigint + delta, 0), INT4_MAX)::int`.
 *
 * Delta-side validation (assertValidCreditDelta) bounds each DELTA, but the
 * re-verify of I-047 showed that alone is not enough: `print_balance + delta`
 * is an INTEGER addition in Postgres, so a valid delta on an existing
 * near-max balance still overflowed with a raw "integer out of range". The
 * arithmetic therefore runs in bigint (no intermediate overflow), the RESULT
 * is clamped into `[0, INT4_MAX]` (the column's own domain), and only then
 * cast back to int4. Shared by every print-balance increment:
 * `adjustCredits` (users.ts), `topUpPrint` (packages.ts),
 * `purchasePrintTopup` (print-packages.ts).
 */
export function int4ClampedAdd(column: AnyColumn, delta: number): SQL<number> {
  return sql`least(greatest((${column})::bigint + ${delta}, 0), ${INT4_MAX})::int`;
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

  // [SEC][MONEY][I-047 fix round 2] Canonical FIRST lock: the member's
  // app_users row, FOR NO KEY UPDATE — BEFORE any lot lock and before the
  // CALLER's booking/checkout row inserts their implicit FOR KEY SHARE on
  // this row (createBooking/checkoutBooking insert those rows earlier in
  // the same transaction). Locking app_users first means a concurrent
  // credit path for the same member queues here — holding nothing — so the
  // KEY SHARE → FOR UPDATE upgrade deadlock is structurally impossible
  // (lib/db/credit-lock-order.int.test.ts). The caller's earlier FK insert
  // already subsumed into this stronger lock is a no-op re-lock.
  await lockUserRowForCreditWrite(tx, orgId, userId);

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

/**
 * [SEC][MONEY][I-047 fix round 2 — THE canonical first lock] Takes a strong
 * `FOR NO KEY UPDATE` lock on the member's `app_users` row and returns it
 * (null if no in-org, live row matches — the caller turns that into its own
 * NOT_FOUND/USER_NOT_FOUND error).
 *
 * EVERY path that will insert an app_users-FK-referencing row (booking,
 * ledger row, time_credit_lot) AND/OR lock lots or app_users MUST call this
 * FIRST — before any FK-inserting statement or lot lock. Canonical order:
 *
 *   app_users(strong) → time_credit_lots → FK inserts
 *
 * Why FIRST: any INSERT referencing app_users implicitly takes a weak `FOR
 * KEY SHARE` on this same row at insert time — before the code's explicit
 * locks. A path that inserts first and strong-locks later can hold KEY
 * SHARE while waiting to upgrade to FOR UPDATE; two such transactions
 * mutually deadlock (40P01 — proven by the barrier tests in
 * lib/db/credit-lock-order.int.test.ts). A strong lock up front subsumes
 * the later implicit KEY SHARE (re-locking a held row is a no-op) and makes
 * app_users-first the single canonical order everywhere.
 *
 * Why FOR NO KEY UPDATE (not FOR UPDATE): it still serializes every credit
 * path for the member (NO KEY UPDATE conflicts with itself and with FOR
 * UPDATE), but stays compatible with the implicit FOR KEY SHARE of
 * unrelated single-statement FK inserts (e.g. a ledger row written by a
 * non-credit path) — those neither block on us nor deadlock us.
 *
 * Exported as THE shared canonical first lock: packages.ts
 * (purchasePackage/topUpPrint) and print-packages.ts (purchasePrintTopup)
 * take it before their FK-inserting statements too.
 */
export async function lockUserRowForCreditWrite(
  tx: Pick<typeof db, "select">,
  orgId: string,
  userId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), eq(appUsers.orgId, orgId)))
    .for("no key update")
    .limit(1);
  return row ?? null;
}

/** Sets app_users.timeCredits = SUM(remainingHours) of non-expired lots; returns the value. */
export async function recomputeCreditCache(opts: {
  orgId: string;
  userId: string;
  tx: Pick<typeof db, "update" | "select">;
}): Promise<number> {
  const { orgId, userId, tx } = opts;

  // [SEC][MONEY][I-047 fix-5] Lock the member's OWN app_users row FIRST,
  // before summing — without this, two concurrent recomputes (e.g. two
  // overlapping admin grants, or a grant racing a spend) can each read the
  // lots table from a snapshot that doesn't yet include the OTHER's
  // just-inserted/just-decremented rows, then both write their own
  // (incomplete) sum: whichever commits LAST silently overwrites the
  // other's correct total with a stale one — the lot rows stay correct, but
  // the cache drifts from their true sum. Locking this row first forces the
  // second concurrent recompute to wait for the first to fully COMMIT (so
  // its lot write is visible), then re-sum against the now-complete data —
  // proven by a forced-overlap barrier test
  // (lib/db/credit-lock-order.int.test.ts). Under the canonical order this
  // is a re-lock of a row the caller (spendTimeCredits /
  // adjustTimeCreditsForAdmin / purchasePackage) already holds — a harmless
  // no-op; it only REALLY locks when recomputeCreditCache is the entry
  // point itself. Postgres never blocks a transaction on its own
  // already-held lock.
  await lockUserRowForCreditWrite(tx, orgId, userId);

  // [SEC][MONEY][I-047 fix round 2, finding 5] `now` is captured AFTER the
  // profile lock, not before — the lock can BLOCK (a concurrent credit path
  // for the same member). A `now` captured before that wait would treat a
  // lot whose expiresAt passed DURING the wait as still spendable in the
  // cached sum (`gt(expiresAt, now)` below) — caching a balance the member
  // can no longer actually spend. Same discipline as spendTimeCredits's
  // post-lots-lock `now` capture.
  const now = new Date();

  const [row] = await tx
    .select({
      // [SEC][MONEY][I-047 fix-3] SUM(int) returns bigint in Postgres, so the
      // sum itself can't overflow — but the old `::int` CAST of that sum
      // threw a raw "integer out of range" once the lots summed past INT4_MAX
      // (delta-side validation can't prevent accumulation across many
      // grants). Clamp the RESULT to the int4 ceiling instead: the cache
      // column is int4, so a beyond-int4 balance is unrepresentable either
      // way — clamping keeps the write alive and monotone near the edge.
      // COALESCE comes BEFORE least on purpose: Postgres LEAST/GREATEST skip
      // NULLs, so least(NULL, INT4_MAX) would return INT4_MAX and an
      // all-expired / lot-less member's cache would silently become INT4_MAX
      // instead of 0 (caught by the `now`-after-lock barrier test).
      total: sql<number>`least(coalesce(sum(${timeCreditLots.remainingHours}), 0), ${INT4_MAX})::int`,
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

  // [SEC][I-047 minor] Defense-in-depth: `adjustCredits` (users.ts) already
  // resolves the target WITHIN its own org before ever calling this
  // function, but this function is itself exported and directly callable —
  // never trust a caller-supplied (orgId, userId) pair to actually be
  // related without checking here too. A cross-org userId (or one that
  // doesn't exist) is rejected before any lot/cache write.
  //
  // [SEC][MONEY][I-047 fix round 2] This is ALSO the canonical FIRST lock:
  // the guard select takes the member's app_users row FOR NO KEY UPDATE, so
  // both branches below (the GRANT branch's lot INSERT with its implicit FK
  // KEY SHARE, and the DEBIT branch's lot row locks) are preceded by the
  // strong lock — concurrent credit paths for the same member serialize
  // here, holding nothing (see lockUserRowForCreditWrite).
  const target = await lockUserRowForCreditWrite(tx, orgId, userId);
  if (!target) throw new Error("NOT_FOUND");

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
    // [SEC][MONEY][I-047 fix round 2] The app_users strong lock is already
    // held (taken by the guard select at the top of this function) — BEFORE
    // this INSERT's implicit FK KEY SHARE, exactly the canonical order.
    // Inserting a lot row FIRST would take only a weak,
    // cross-transaction-compatible FK lock on this row, letting two
    // concurrent grants both proceed past their insert and then deadlock
    // trying to each upgrade inside recomputeCreditCache. Locking strong up
    // front instead makes a concurrent grant for the same user simply queue
    // behind this one.
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
