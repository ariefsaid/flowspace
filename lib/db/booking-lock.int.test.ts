/**
 * Integration proof for the FR-850/FR-851 advisory-lock primitives
 * (lib/db/bookings.ts's acquireFacilityLock / acquireOrgDayLock).
 *
 * No booking-create call site exists yet to exercise these against real
 * booking rows (that lands with the createBooking rewrite, a separate
 * dispatch) — this proves the underlying `pg_advisory_xact_lock` mechanism
 * itself: two concurrent transactions holding the SAME lock key must
 * serialize (the second blocks until the first commits), and two
 * transactions holding DIFFERENT keys must NOT block each other.
 *
 * Classic "read, sleep, increment, write" race harness against a scratch
 * table: without serialization both transactions would read the same stale
 * value and the final counter would be short (a lost update); with the lock
 * held for the transaction's duration, the second transaction can only
 * start its read after the first commits, so the final value is always
 * exactly right.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { acquireFacilityLock, acquireOrgDayLock } from "@/lib/db/bookings";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 5 });

beforeAll(async () => {
  await testSql`CREATE TABLE IF NOT EXISTS "lock_race_probe" ("id" text PRIMARY KEY, "counter" integer NOT NULL DEFAULT 0)`;
  await testSql`DELETE FROM "lock_race_probe"`;
}, 30_000);

afterAll(async () => {
  await testSql`DROP TABLE IF EXISTS "lock_race_probe"`;
  await testSql.end();
}, 30_000);

const SLEEP_MS = 150;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * One "read, sleep, write" transaction against the probe row, taking the
 * given lock as its first statement. Concurrent calls with the SAME lock
 * key must serialize (no lost update); different keys must not block.
 */
async function raceIncrement(
  probeId: string,
  acquireLock: (tx: Tx) => Promise<void>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await acquireLock(tx);
    const rows = (await tx.execute(
      sql`SELECT counter FROM "lock_race_probe" WHERE id = ${probeId}`,
    )) as unknown as Array<{ counter: number }>;
    const current = rows[0]?.counter ?? 0;
    await tx.execute(sql`SELECT pg_sleep(${SLEEP_MS / 1000})`);
    await tx.execute(
      sql`UPDATE "lock_race_probe" SET counter = ${current + 1} WHERE id = ${probeId}`,
    );
  });
}

async function getCounter(probeId: string): Promise<number> {
  const [row] = await testSql`SELECT counter FROM "lock_race_probe" WHERE id = ${probeId}`;
  return row?.counter ?? -1;
}

describe("advisory-lock primitives — race-safety mechanism proof", () => {
  it("acquireFacilityLock: two concurrent same-key increments never lose an update", async () => {
    const probeId = "facility-probe";
    await testSql`INSERT INTO "lock_race_probe" (id, counter) VALUES (${probeId}, 0)`;

    await Promise.all([
      raceIncrement(probeId, (tx) => acquireFacilityLock(tx, "race-org", "race-facility")),
      raceIncrement(probeId, (tx) => acquireFacilityLock(tx, "race-org", "race-facility")),
    ]);

    // If the lock did NOT serialize, both transactions would read 0 and
    // both write 1 — a lost update. Correctly serialized, the counter is 2.
    expect(await getCounter(probeId)).toBe(2);
  });

  it("acquireOrgDayLock: two concurrent same-key increments never lose an update", async () => {
    const probeId = "org-day-probe";
    await testSql`INSERT INTO "lock_race_probe" (id, counter) VALUES (${probeId}, 0)`;

    await Promise.all([
      raceIncrement(probeId, (tx) => acquireOrgDayLock(tx, "race-org", "2026-08-01")),
      raceIncrement(probeId, (tx) => acquireOrgDayLock(tx, "race-org", "2026-08-01")),
    ]);

    expect(await getCounter(probeId)).toBe(2);
  });

  it("different lock keys do not serialize against each other (no false contention)", async () => {
    const probeIdA = "diff-key-a";
    const probeIdB = "diff-key-b";
    await testSql`INSERT INTO "lock_race_probe" (id, counter) VALUES (${probeIdA}, 0), (${probeIdB}, 0)`;

    const startedAt = Date.now();
    await Promise.all([
      raceIncrement(probeIdA, (tx) => acquireFacilityLock(tx, "race-org", "facility-a")),
      raceIncrement(probeIdB, (tx) => acquireFacilityLock(tx, "race-org", "facility-b")),
    ]);
    const elapsedMs = Date.now() - startedAt;

    expect(await getCounter(probeIdA)).toBe(1);
    expect(await getCounter(probeIdB)).toBe(1);
    // Serialized same-key runs take ~2×SLEEP_MS; independent keys run
    // concurrently and should finish in ~1×SLEEP_MS (generous margin for
    // scheduling jitter on a shared local Postgres).
    expect(elapsedMs).toBeLessThan(SLEEP_MS * 2);
  });
});
