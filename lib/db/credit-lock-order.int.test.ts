/**
 * Integration tests for the cross-module credit-write lock ORDER (I-047
 * lock-order deadlocks: fix-4 round 1, findings 4+5 of fix round 2). Runs
 * against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * These findings are inherently cross-module: `adjustCredits` (users.ts) and
 * `spendTimeCredits`/`adjustTimeCreditsForAdmin`/`recomputeCreditCache`
 * (time-credit-lots.ts) — plus the booking/purchase paths that call them —
 * all touch the SAME resources for one member: their `app_users` row and
 * their `time_credit_lots` rows. A dedicated file keeps that cross-cutting
 * concern out of any single module's own test file.
 *
 * CANONICAL ORDER (fix round 2 — supersedes round 1's lots-before-app_users):
 * every path that inserts an app_users-FK-referencing row AND/OR locks lots
 * or app_users must acquire an EXPLICIT strong lock (`FOR NO KEY UPDATE`) on
 * the target member's `app_users` row FIRST, before any FK-inserting
 * statement or lot lock: app_users(strong) → lots → FK inserts.
 *
 * Why app_users FIRST: any INSERT referencing app_users (a booking, ledger
 * row, lot) implicitly takes a weak `FOR KEY SHARE` on that member's
 * app_users row at insert time — BEFORE the code's explicit locks. A path
 * that inserts first and strong-locks later can therefore hold KEY SHARE
 * while waiting to upgrade to FOR UPDATE; two such transactions mutually
 * deadlock (40P01) — a held strong lock up front subsumes the later implicit
 * KEY SHARE and makes app_users-first the single canonical order everywhere.
 * `FOR NO KEY UPDATE` (not FOR UPDATE) is the strength of choice: it still
 * serializes every credit path for the member, but stays compatible with the
 * implicit FOR KEY SHARE of unrelated single-statement FK inserts.
 *
 * Fix-5: `recomputeCreditCache` (the derived-cache writer) must serialize
 * against a concurrent recompute for the SAME user, and must capture `now`
 * AFTER that lock (a `now` captured before the wait treats a lot that
 * expired during the wait as still spendable in the cached sum).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { organizations, appUsers, timeCreditLots, facilities, bookings } from "@/lib/db/schema";
import { db } from "@/lib/db/drizzle";
import { spendTimeCredits } from "@/lib/db/time-credit-lots";
import { adjustCredits } from "@/lib/db/users";
import { createBooking } from "@/lib/db/bookings";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 5 });
const testDb = drizzle(testSql, { schema });

/** Wraps spendTimeCredits in its own transaction, as every real caller (createBooking/checkoutBooking) does. */
function spend(orgId: string, userId: string, hours: number) {
  return db.transaction((tx) => spendTimeCredits({ orgId, userId, hours, tx }));
}

// ---------------------------------------------------------------------------
// Deterministic ROW-lock barrier (same discipline as lib/db/bookings.int.
// test.ts / lib/db/time-credit-lots.int.test.ts): holds the target row(s) via
// a real lock FIRST, starts the racing ops, and polls `pg_locks` until the
// expected number of backends are genuinely BLOCKED on it — only then
// releases, proving real simultaneous demand rather than trusting timing.
// ---------------------------------------------------------------------------
async function runWithRowLockBarrier(
  holderSql: string,
  waiters: number,
  ops: Array<() => Promise<unknown>>,
  opts: { holdMsAfterWaiters?: number } = {},
): Promise<PromiseSettledResult<unknown>[]> {
  let racePromise!: Promise<PromiseSettledResult<unknown>[]>;
  await testSql.begin(async (holder) => {
    await holder.unsafe(holderSql);
    racePromise = Promise.allSettled(ops.map((op) => op()));
    const deadline = Date.now() + 3000;
    for (;;) {
      const rows = await holder.unsafe<{ n: number }[]>(
        `select count(*)::int as n from pg_locks where locktype IN ('transactionid', 'tuple') and not granted`,
      );
      if (Number(rows[0]?.n ?? 0) >= waiters) {
        // Optional extra hold AFTER the waiters are genuinely queued — lets a
        // test drive a state change (e.g. a lot expiring) into the window the
        // waiters are stuck in, before releasing them.
        if (opts.holdMsAfterWaiters) await new Promise((r) => setTimeout(r, opts.holdMsAfterWaiters));
        break;
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${waiters} row-lock waiter(s)`);
      }
      await new Promise((r) => setTimeout(r, 15));
    }
    // Returning here ends the holder's transaction (COMMIT), releasing the
    // row lock and letting every genuinely-waiting op proceed for real.
  });
  return racePromise;
}

/** Every settled result must be a fulfillment whose text shows no 40P01. */
function expectNoDeadlock(results: PromiseSettledResult<unknown>[]): void {
  for (const r of results) {
    if (r.status === "rejected") {
      // Fail loud with the actual reason — a real Postgres "deadlock
      // detected" (40P01) surfaces on the driver error's `.cause`, not
      // its top-level `.message` — check both explicitly so this
      // assertion can't silently miss it.
      const reason = (r as PromiseRejectedResult).reason as { message?: string; cause?: { message?: string } };
      const text = `${reason?.message ?? ""} ${reason?.cause?.message ?? ""}`;
      expect(text).not.toMatch(/deadlock/i);
    }
  }
  // Surface the real rejection reasons on failure instead of a bare boolean.
  const reasons = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => {
      const reason = r.reason as { message?: string; cause?: { message?: string } };
      return `${reason?.message ?? "?"} :: ${reason?.cause?.message ?? ""}`;
    });
  expect(reasons).toEqual([]);
}

let orgAId: string;
let userAId: string;
let facilityAId: string;
let facilityBId: string;

async function getUser(userId: string): Promise<{ timeCredits: number; printBalance: number }> {
  const [row] = await testDb
    .select({ timeCredits: appUsers.timeCredits, printBalance: appUsers.printBalance })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1);
  return row!;
}

async function lotSum(userId: string): Promise<number> {
  const rows = await testDb.select({ remainingHours: timeCreditLots.remainingHours }).from(timeCreditLots).where(eq(timeCreditLots.userId, userId));
  return rows.reduce((sum, r) => sum + r.remainingHours, 0);
}

beforeAll(async () => {
  // CASCADE wipes the FK-referencing tables too (lots, bookings, ledger,
  // facilities, …) — the booking-path tests below insert into them.
  await testSql`TRUNCATE TABLE "time_credit_lots","app_users","organizations" RESTART IDENTITY CASCADE`;
  const [orgA] = await testDb.insert(organizations).values({ name: "Credit Lock Order Org", slug: "credit-lock-order-org-test" }).returning();
  orgAId = orgA.id;
  // Two same-type seats on DIFFERENT ids: the two-booking race below uses
  // different days AND different facilities so the day/facility ADVISORY
  // locks (which createBooking takes before any row lock) never contend —
  // the only contended resources left are the ones the finding is about.
  const [fa] = await testDb.insert(facilities).values({ orgId: orgAId, name: "Lock Order Seat A", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, capacity: 1, seatLabel: "A", zone: "DESK", maxHoursCap: 8, available: true }).returning();
  const [fb] = await testDb.insert(facilities).values({ orgId: orgAId, name: "Lock Order Seat B", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, capacity: 1, seatLabel: "B", zone: "DESK", maxHoursCap: 8, available: true }).returning();
  facilityAId = fa.id;
  facilityBId = fb.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "time_credit_lots","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

async function seedUser(): Promise<string> {
  const [u] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: `lockorder-${Date.now()}-${Math.random().toString(36).slice(2)}@x.test`, name: "LockOrder", role: "MEMBER", printBalance: 0, timeCredits: 0 })
    .returning();
  return u.id;
}

describe("credit-write lock order — adjustCredits vs. booking/checkout spend (I-047 fix-4)", () => {
  it(
    "a combined admin credit-adjust (printBalance + timeCredits) and a booking/checkout credit-spend on the SAME user, forced into genuine simultaneous demand on the shared lots row, both complete — never a deadlock (deterministic row-lock barrier)",
    async () => {
      userAId = await seedUser();
      await testDb.insert(timeCreditLots).values({
        orgId: orgAId,
        userId: userAId,
        totalHours: 20,
        remainingHours: 20,
        expiresAt: new Date(Date.now() + 30 * 24 * 3_600_000),
      });

      const adjustAttempt = () => adjustCredits(orgAId, userAId, { timeCreditsDelta: -5, printBalanceDelta: 10 });
      const spendAttempt = () => spend(orgAId, userAId, 3);

      // Under the canonical app_users-FIRST order, both paths' FIRST real
      // row lock is the member's app_users row (FOR NO KEY UPDATE) — but
      // holding the LOTS row here still forces genuine simultaneous demand:
      // the first op takes app_users then queues on this lot row; the second
      // queues on the first's app_users lock. Both are genuinely blocked
      // before either can finish, which is exactly the adversarial condition
      // a lock-order deadlock needs (each transaction holding one contended
      // resource while waiting on the other).
      const results = await runWithRowLockBarrier(
        `select * from time_credit_lots where user_id = '${userAId}' for update`,
        2,
        [adjustAttempt, spendAttempt],
      );

      for (const r of results) {
        if (r.status === "rejected") {
          // Fail loud with the actual reason — a real Postgres "deadlock
          // detected" (40P01) surfaces on the driver error's `.cause`, not
          // its top-level `.message` — check both explicitly so this
          // assertion can't silently miss it.
          const reason = (r as PromiseRejectedResult).reason as { message?: string; cause?: { message?: string } };
          const text = `${reason?.message ?? ""} ${reason?.cause?.message ?? ""}`;
          expect(text).not.toMatch(/deadlock/i);
        }
      }
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      // Both writes actually landed (commutative regardless of interleave
      // order): 20 - 5 (admin debit) - 3 (spend) = 12 remaining hours.
      const finalUser = await getUser(userAId);
      expect(finalUser.printBalance).toBe(10);
      expect(await lotSum(userAId)).toBe(12);
      expect(finalUser.timeCredits).toBe(12); // cache matches the authoritative lot sum (fix-5 too)
    },
    10_000,
  );
});

describe("recomputeCreditCache — concurrent-grant race (I-047 fix-5)", () => {
  it(
    "two concurrent admin credit grants for the SAME user, forced into genuine simultaneous demand on the app_users row, both land in the cache — never a last-writer-wins stale overwrite (deterministic row-lock barrier)",
    async () => {
      const userId = await seedUser();

      const grantA = () => adjustCredits(orgAId, userId, { timeCreditsDelta: 5 });
      const grantB = () => adjustCredits(orgAId, userId, { timeCreditsDelta: 3 });

      // A positive delta only INSERTs a new lot (no lock on any pre-existing
      // lot row) — under the canonical order the first REAL contended lock
      // either grant takes is the member's own app_users row, taken BEFORE
      // its insert (lockUserRowForCreditWrite, FOR NO KEY UPDATE). Holding
      // THAT row externally forces both grants to genuinely queue on it
      // simultaneously.
      const results = await runWithRowLockBarrier(
        `select * from app_users where id = '${userId}' for no key update`,
        2,
        [grantA, grantB],
      );
      for (const r of results) {
        if (r.status === "rejected") {
          const reason = (r as PromiseRejectedResult).reason as { message?: string; cause?: { message?: string } };
          const text = `${reason?.message ?? ""} ${reason?.cause?.message ?? ""}`;
          expect(text).not.toMatch(/deadlock/i);
        }
      }
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      const lots = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.userId, userId));
      expect(lots).toHaveLength(2); // both grants actually inserted their own lot — no lost write
      const finalUser = await getUser(userId);
      expect(await lotSum(userId)).toBe(8);
      expect(finalUser.timeCredits).toBe(8); // the cache reflects BOTH grants, not whichever committed last against a stale sum
    },
    10_000,
  );
});

// ---------------------------------------------------------------------------
// I-047 fix round 2, finding 4 — booking-create vs credit-write deadlock.
//
// Round 1 normalized "lots before app_users" but MISSED that any INSERT
// referencing app_users (a booking row) implicitly takes a weak FOR KEY
// SHARE on the member's app_users row AT INSERT TIME — before any explicit
// lock. Two scheduled creates for the same user each hold KEY SHARE (from
// their booking inserts) and then mutually wait: the winner of the lots
// locks tries to upgrade app_users to FOR UPDATE (conflicts with the
// other's KEY SHARE) while the other waits on the lots locks — a guaranteed
// 40P01 cycle. The canonical fix: lock the member's app_users row FOR NO
// KEY UPDATE FIRST, before the booking insert and before any lot lock.
// ---------------------------------------------------------------------------
describe("scheduled createBooking vs credit-write lock order (I-047 fix round 2, finding 4)", () => {
  /** Tomorrow and the day after, 09:00–11:00 UTC — distinct org-days, inside every horizon bound. */
  function dayWindow(offsetDays: number): { startAt: Date; endAt: Date } {
    const startAt = new Date(Date.now() + offsetDays * 24 * 3_600_000);
    startAt.setUTCHours(9, 0, 0, 0);
    const endAt = new Date(startAt);
    endAt.setUTCHours(11, 0, 0, 0);
    return { startAt, endAt };
  }

  function scheduledCreate(userId: string, facilityId: string, facilityName: string, offsetDays: number) {
    return () =>
      createBooking({
        orgId: orgAId,
        userId,
        tier: "REGULAR",
        facilityType: "COWORKING_SEAT",
        facilityId,
        facilityName,
        ...dayWindow(offsetDays),
        paymentMethod: "time_credits",
      });
  }

  it(
    "a scheduled time_credits createBooking and a negative admin credit-adjust on the SAME user, released together onto the member's app_users row, both complete — one serializes cleanly, never a 40P01 (deterministic row-lock barrier)",
    async () => {
      const userId = await seedUser();
      await testDb.insert(timeCreditLots).values({
        orgId: orgAId,
        userId,
        totalHours: 10,
        remainingHours: 10,
        expiresAt: new Date(Date.now() + 30 * 24 * 3_600_000),
      });

      const createAttempt = scheduledCreate(userId, facilityAId, "Lock Order Seat A", 1);
      const adjustAttempt = () => adjustCredits(orgAId, userId, { timeCreditsDelta: -3 });

      // Both paths' FIRST real row lock, under the canonical app_users-first
      // order, is this member's app_users row — holding it forces BOTH to
      // genuinely queue on the same single serialization point before either
      // touches a lot row or inserts anything. (Pre-fix, createBooking's
      // booking INSERT took only a weak implicit FOR KEY SHARE — compatible
      // with this holder — and raced past it to the lots locks instead.)
      const results = await runWithRowLockBarrier(
        `select * from app_users where id = '${userId}' for no key update`,
        2,
        [createAttempt, adjustAttempt],
      );

      expectNoDeadlock(results);

      // Both writes actually landed, in EITHER serialization order (they
      // commute): 10h − 2h (booking) − 3h (admin debit) = 5h.
      const created = await testDb.select().from(bookings).where(eq(bookings.userId, userId));
      expect(created).toHaveLength(1);
      expect(await lotSum(userId)).toBe(5);
      const finalUser = await getUser(userId);
      expect(finalUser.timeCredits).toBe(5); // cache matches the authoritative lot sum
    },
    10_000,
  );

  it(
    "two scheduled time_credits createBooking calls for the SAME user on different days — the implicit-FK KEY SHARE → FOR UPDATE upgrade race — both complete, never a 40P01 (deterministic row-lock barrier)",
    async () => {
      const userId = await seedUser();
      await testDb.insert(timeCreditLots).values({
        orgId: orgAId,
        userId,
        totalHours: 10,
        remainingHours: 10,
        expiresAt: new Date(Date.now() + 30 * 24 * 3_600_000),
      });

      // Different days AND different facilities (offsets 3/4 — clear of the
      // earlier test's day-1 booking on Seat A): the day/facility advisory
      // locks never contend, so the only contended resources are the member's
      // lots and app_users rows — exactly the finding's pair.
      const createA = scheduledCreate(userId, facilityAId, "Lock Order Seat A", 3);
      const createB = scheduledCreate(userId, facilityBId, "Lock Order Seat B", 4);

      // Holding the member's lots first: pre-fix, BOTH creates sail past
      // their booking INSERTs (each acquiring an implicit, mutually
      // compatible FOR KEY SHARE on the member's app_users row) and then both
      // genuinely queue HERE (waiters = 2). On release the lots winner's
      // recompute tries to upgrade app_users to FOR UPDATE — conflicting with
      // the other create's still-held KEY SHARE — while that other create
      // waits on the lots locks: a guaranteed 40P01 cycle. Under the canonical
      // app_users-first order, instead, the second create blocks at its FIRST
      // statement (the second op queues as the app_users waiter) and the pair
      // serializes cleanly.
      const results = await runWithRowLockBarrier(
        `select * from time_credit_lots where user_id = '${userId}' for update`,
        2,
        [createA, createB],
      );

      expectNoDeadlock(results);

      // Both bookings actually landed (no lost create), and the single lot
      // was debited exactly 2h + 2h = 4h in either commit order.
      const created = await testDb.select().from(bookings).where(eq(bookings.userId, userId));
      expect(created).toHaveLength(2);
      expect(await lotSum(userId)).toBe(6);
      const finalUser = await getUser(userId);
      expect(finalUser.timeCredits).toBe(6); // cache matches the authoritative lot sum
    },
    10_000,
  );
});
