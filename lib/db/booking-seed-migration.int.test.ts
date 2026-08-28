/**
 * Integration test for the I-040 booking-seed migration
 * (supabase/migrations/0016_booking_seed.sql).
 *
 * A genuinely fresh `supabase db reset` seeds zero rows here (no
 * organizations exist yet at migration-apply time — see the migration's own
 * header comment); this test instead proves the migration's SQL is correct
 * and idempotent by replaying it (the exact statements 0016 runs) against an
 * org created directly in Postgres, mirroring the pattern in
 * lib/db/print-migration.int.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const sql = postgres(TEST_URL, { prepare: false, max: 3 });

const MIGRATION_SQL = readFileSync(
  join(process.cwd(), "supabase/migrations/0016_booking_seed.sql"),
  "utf-8",
);

let orgId: string;

beforeAll(async () => {
  await sql`TRUNCATE TABLE "time_credit_packages","facilities","organizations" RESTART IDENTITY CASCADE`;
  const [org] = await sql`
    INSERT INTO organizations (id, name, slug)
    VALUES (gen_random_uuid()::text, 'Booking Seed Migration Org', 'booking-seed-migration-org')
    RETURNING id`;
  orgId = org.id;

  await sql.unsafe(MIGRATION_SQL);
}, 30_000);

afterAll(async () => {
  await sql`TRUNCATE TABLE "time_credit_packages","facilities","organizations" RESTART IDENTITY CASCADE`;
  await sql.end();
}, 30_000);

describe("I-040 booking-seed migration (0016)", () => {
  it("seeds exactly 23 facilities for the org, matching OBS-800..803", async () => {
    const rows = await sql`SELECT zone, type FROM facilities WHERE org_id = ${orgId}`;
    expect(rows).toHaveLength(23);
    expect(rows.filter((r) => r.zone === "DESK")).toHaveLength(12);
    expect(rows.filter((r) => r.zone === "COUNTER")).toHaveLength(8);
    expect(rows.filter((r) => r.zone === "MEETING")).toHaveLength(2);
    expect(rows.filter((r) => r.type === "FULL_ROOM")).toHaveLength(1);
  });

  it("seeds exactly 4 time-credit packages, matching OBS-826", async () => {
    const rows = await sql`
      SELECT hours, price_rupiah FROM time_credit_packages WHERE org_id = ${orgId} ORDER BY hours`;
    expect(rows.map((r) => [r.hours, r.price_rupiah])).toEqual([
      [5, 75000],
      [10, 140000],
      [20, 260000],
      [50, 600000],
    ]);
  });

  it("is idempotent — re-running the migration SQL adds no duplicate rows", async () => {
    await sql.unsafe(MIGRATION_SQL);
    const [{ count: facCount }] = await sql`
      SELECT count(*)::int AS count FROM facilities WHERE org_id = ${orgId}`;
    const [{ count: pkgCount }] = await sql`
      SELECT count(*)::int AS count FROM time_credit_packages WHERE org_id = ${orgId}`;
    expect(facCount).toBe(23);
    expect(pkgCount).toBe(4);
  });
});
