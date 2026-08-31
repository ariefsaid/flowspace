/**
 * Integration tests for the cross-module credit-write lock ORDER (I-047 fix-4
 * lock-order deadlock, fix-5 credit-cache race). Runs against the Supabase
 * local Postgres via TEST_DATABASE_URL.
 *
 * These two findings are inherently cross-module: `adjustCredits` (users.ts)
 * and `spendTimeCredits`/`adjustTimeCreditsForAdmin`/`recomputeCreditCache`
 * (time-credit-lots.ts) all touch the SAME two resources — a member's
 * `time_credit_lots` rows and their `app_users` row — from different entry
 * points (admin manual adjust vs. booking/checkout spend). A dedicated file
 * keeps that cross-cutting concern out of either module's own test file.
 *
 * Fix-4: every credit-touching path must acquire time_credit_lots BEFORE
 * app_users (never the reverse) — a consistent, single, canonical order is
 * what makes a lock-order deadlock structurally impossible (a cycle needs at
 * least two transactions acquiring the SAME pair of resources in opposite
 * order).
 * Fix-5: `recomputeCreditCache` (the derived-cache writer) must serialize
 * against a concurrent recompute for the SAME user, so two overlapping
 * grants/spends can never both compute their sum from a stale snapshot and
 * have the later COMMIT silently undo the earlier one's write.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { organizations, appUsers, timeCreditLots } from "@/lib/db/schema";
import { db } from "@/lib/db/drizzle";
import { spendTimeCredits } from "@/lib/db/time-credit-lots";
import { adjustCredits } from "@/lib/db/users";

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
      if (Number(rows[0]?.n ?? 0) >= waiters) break;
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

let orgAId: string;
let userAId: string;

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
  await testSql`TRUNCATE TABLE "time_credit_lots","app_users","organizations" RESTART IDENTITY CASCADE`;
  const [orgA] = await testDb.insert(organizations).values({ name: "Credit Lock Order Org", slug: "credit-lock-order-org-test" }).returning();
  orgAId = orgA.id;
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

      // Both paths' FIRST real row lock, under the fixed canonical order, is
      // the member's time_credit_lots row(s) — holding THAT row externally
      // forces both to genuinely queue on the SAME resource simultaneously,
      // which is exactly the adversarial condition a lock-order deadlock
      // needs (each transaction holding one contended resource while
      // waiting on the other).
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
      // lot row) — the first REAL contended lock either grant takes is a
      // `FOR UPDATE` lock on the member's own app_users row, taken BEFORE
      // the insert (lockUserRowForCreditWrite). Holding THAT row externally
      // forces both grants to genuinely queue on it simultaneously.
      const results = await runWithRowLockBarrier(
        `select * from app_users where id = '${userId}' for update`,
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
