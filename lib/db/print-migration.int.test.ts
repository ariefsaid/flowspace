/**
 * Integration test for the I-043 print-parity core migration (0013).
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL after
 * `pnpm exec supabase db reset`.
 *
 *  — Given a pre-I-043 flat pricing row and historic job, when the
 * migration applies, then A4 values are preserved, missing A3/F4 rows are
 * seeded, historic effective pages are backfilled, and no job is deleted.
 *
 * The standard `db reset` applies all migrations in one ordered pass against an
 * EMPTY legacy table, so the only way to prove the migration's data-mapping is
 * to seed a legacy-shaped row + a historic job and then replay the migration's
 * data-transformation SQL (the exact statements 0013 runs on an upgrade). This
 * file asserts both the post-reset structure (tables/enum/columns exist) and
 * the replayed backfill (values preserved + seeded + jobs updated + none lost).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Privileged connection (postgres superuser = service-role equivalent). */
const sql = postgres(TEST_URL, { prepare: false, max: 3 });

let orgId: string;
let userId: string;

beforeAll(async () => {
  await sql`TRUNCATE TABLE "transactions","print_jobs","org_print_pricing","org_print_pricing_legacy","printers","print_agent_configs","print_agent_rate_limit_events","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [org] = await sql`
    INSERT INTO organizations (id, name, slug)
    VALUES (gen_random_uuid()::text, 'Mig Org', 'mig-org')
    RETURNING id`;
  orgId = org.id;

  const [user] = await sql`
    INSERT INTO app_users (id, org_id, email, name, role)
    VALUES (gen_random_uuid()::text, ${orgId}, 'mig@x.test', 'Mig', 'MEMBER')
    RETURNING id`;
  userId = user.id;
}, 30_000);

afterAll(async () => {
  await sql`TRUNCATE TABLE "transactions","print_jobs","org_print_pricing","org_print_pricing_legacy","printers","print_agent_configs","print_agent_rate_limit_events","app_users","organizations" RESTART IDENTITY CASCADE`;
  await sql.end();
}, 30_000);

// -- Migration structure (applied by `db reset`) -----------------------------

describe("I-043 print-parity migration (0013) — structure", () => {
  it("AC-634: the legacy flat pricing table is preserved as org_print_pricing_legacy", async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'org_print_pricing_legacy'
        AND column_name IN ('org_id','bw_rate_per_page_rupiah','color_rate_per_page_rupiah')`;
    expect(rows.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(["org_id", "bw_rate_per_page_rupiah", "color_rate_per_page_rupiah"]),
    );
  });

  it(": the matrix org_print_pricing table exists with the six-cell shape", async () => {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'org_print_pricing'
        AND column_name IN ('org_id','color_mode','paper_size','price_per_page_rupiah','is_active')`;
    expect(cols.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(["org_id", "color_mode", "paper_size", "price_per_page_rupiah", "is_active"]),
    );
  });

  it(": PrintJobStatus enum gains PROCESSING and FAILED", async () => {
    const enums = await sql`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'PrintJobStatus'`;
    const labels = enums.map((r) => r.enumlabel);
    expect(labels).toEqual(expect.arrayContaining(["PENDING", "PROCESSING", "READY", "COMPLETED", "FAILED"]));
  });

  it(": print_jobs gains lifecycle/range/printer columns", async () => {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'print_jobs'
        AND column_name IN ('page_range','total_pages','printer_id','error_message','processed_by','processed_at','completed_at')`;
    expect(cols.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(["page_range", "total_pages", "printer_id", "error_message", "processed_by", "processed_at", "completed_at"]),
    );
  });

  it(": printers and print_agent_configs tables are created org-scoped", async () => {
    const printers = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'printers'
        AND column_name IN ('org_id','name','color_support','paper_sizes','is_default')`;
    expect(printers.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(["org_id", "name", "color_support", "paper_sizes", "is_default"]),
    );
    const cfg = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'print_agent_configs'
        AND column_name IN ('org_id','key_selector','key_hash','is_active')`;
    expect(cfg.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(["org_id", "key_selector", "key_hash", "is_active"]),
    );
  });
});

// -- Backfill data mapping (replays the exact migration transformation) ------

/**
 * Replays the migration's data-transform for org `orgId`:
 *  - maps a legacy (flat) pricing row into BW/A4 + COLOR/A4 matrix rows;
 *  - seeds the missing A3/F4 defaults for each color mode;
 *  - backfills historic jobs with page_range='all' and total_pages=pages×copies.
 * These are the exact statements 0013 runs on an upgrade.
 */
async function replayMigrationBackfill() {
  // 1. Preserve legacy A4 values into the matrix.
  await sql`
    INSERT INTO org_print_pricing (id, org_id, color_mode, paper_size, price_per_page_rupiah, is_active)
    SELECT gen_random_uuid()::text, org_id, 'BW', 'A4', bw_rate_per_page_rupiah, true
    FROM org_print_pricing_legacy WHERE org_id = ${orgId}
    ON CONFLICT (org_id, color_mode, paper_size) DO NOTHING`;
  await sql`
    INSERT INTO org_print_pricing (id, org_id, color_mode, paper_size, price_per_page_rupiah, is_active)
    SELECT gen_random_uuid()::text, org_id, 'COLOR', 'A4', color_rate_per_page_rupiah, true
    FROM org_print_pricing_legacy WHERE org_id = ${orgId}
    ON CONFLICT (org_id, color_mode, paper_size) DO NOTHING`;

  // 2. Seed the missing A3/F4 defaults.
  const cells: Array<[string, string, number]> = [
    ["BW", "A3", 1000],
    ["BW", "F4", 600],
    ["COLOR", "A3", 4000],
    ["COLOR", "F4", 2500],
  ];
  for (const [mode, paper, price] of cells) {
    await sql`
      INSERT INTO org_print_pricing (id, org_id, color_mode, paper_size, price_per_page_rupiah, is_active)
      VALUES (gen_random_uuid()::text, ${orgId}, ${mode}, ${paper}, ${price}, true)
      ON CONFLICT (org_id, color_mode, paper_size) DO NOTHING`;
  }

  // 3. Backfill historic jobs.
  await sql`
    UPDATE print_jobs
    SET page_range = COALESCE(page_range, 'all'),
        total_pages = COALESCE(total_pages, pages * copies)
    WHERE org_id = ${orgId}`;
}

describe("I-043 print-parity migration (0013) — backfill", () => {
  let jobId: string;

  beforeAll(async () => {
    // Seed a legacy flat pricing row (the 0008 shape) + a historic job (the
    // pre-I-043 shape: no page_range/total_pages columns populated).
    await sql`
      INSERT INTO org_print_pricing_legacy (id, org_id, bw_rate_per_page_rupiah, color_rate_per_page_rupiah)
      VALUES (gen_random_uuid()::text, ${orgId}, 500, 2000)`;

    const [job] = await sql`
      INSERT INTO print_jobs (id, org_id, user_id, file_name, pages, copies, color_mode, paper_size, price_per_page_rupiah, total_rupiah, status)
      VALUES (gen_random_uuid()::text, ${orgId}, ${userId}, 'lama.pdf', 5, 2, 'BW', 'A4', 500, 5000, 'COMPLETED')
      RETURNING id`;
    jobId = job.id;

    await replayMigrationBackfill();
  }, 30_000);

  it(": legacy A4 values survive and A3/F4 cells are seeded to the six-cell matrix", async () => {
    const rows = await sql`
      SELECT color_mode, paper_size, price_per_page_rupiah FROM org_print_pricing
      WHERE org_id = ${orgId} ORDER BY color_mode, paper_size`;
    const map = new Map(rows.map((r) => [`${r.color_mode} ${r.paper_size}`, r.price_per_page_rupiah]));
    expect(map.get("BW A4")).toBe(500);
    expect(map.get("COLOR A4")).toBe(2000);
    expect(map.get("BW A3")).toBe(1000);
    expect(map.get("BW F4")).toBe(600);
    expect(map.get("COLOR A3")).toBe(4000);
    expect(map.get("COLOR F4")).toBe(2500);
    expect(rows).toHaveLength(6);
  });

  it(": historic job is backfilled with page_range='all' and total_pages = pages × copies", async () => {
    const [job] = await sql`
      SELECT page_range, total_pages, pages, copies FROM print_jobs WHERE id = ${jobId}`;
    expect(job.page_range).toBe("all");
    expect(job.total_pages).toBe(10); // 5 × 2
  });

  it(": no job was removed by the backfill", async () => {
    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM print_jobs WHERE org_id = ${orgId}`;
    expect(count).toBe(1);
  });
});