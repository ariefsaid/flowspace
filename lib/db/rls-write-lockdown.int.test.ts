/**
 * RLS write lockdown — I-046, spec 0011.
 *
 * Verified vuln: every business table GRANTs INSERT/UPDATE/DELETE to the
 * `authenticated` role, and the browser ships the anon key + Supabase URL —
 * so a logged-in MEMBER can hit the Supabase Data API directly and write
 * their own org's rows (e.g. set tier discounts to 100%, self-upgrade
 * membership_tier), bypassing the server ADMIN gate. This test proves the
 * scoped `authenticated` role can no longer write ANY business table, while
 * scoped SELECT (including cross-org exclusion) and service-role writes
 * remain intact.
 *
 * Pattern reused verbatim from lib/db/rls.int.test.ts: a `rootSql.begin` tx
 * with `SET LOCAL ROLE authenticated` + `SET LOCAL "request.jwt.claims"`
 * simulates exactly what a member's Supabase JWT grants at the Data API.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  membershipTierConfig,
  cafeOrders,
  bookings,
} from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Privileged connection — runs as the postgres superuser (service-role equivalent). */
const rootSql = postgres(TEST_URL, { prepare: false, max: 3 });
const rootDb = drizzle(rootSql, { schema });

/**
 * The 12 business tables the I-046 REVOKE migration must lock down, plus the
 * 4 new print-parity tables (I-043, migration 0012/0013) and the I-040
 * `time_credit_lots` table (migration 0015) that adopt the same SELECT-only
 * convention from their first migration (ADR-0015 addendum) — `org_print_pricing`
 * is re-created (renamed to `_legacy` + a new matrix table under the same
 * name) by migration 0012, so it must be re-proven here too, not just
 * inherited from I-046's original REVOKE.
 */
const BUSINESS_TABLES = [
  "app_users",
  "organizations",
  "cafe_menu_items",
  "cafe_orders",
  "cafe_order_items",
  "time_credit_packages",
  "facilities",
  "bookings",
  "print_jobs",
  "transactions",
  "membership_tier_config",
  "org_print_pricing",
  "printers",
  "print_agent_configs",
  "print_agent_rate_limit_events",
  "time_credit_lots",
  "print_topup_packages",
  "org_settings",
] as const;

let orgAId: string;
let orgBId: string;
let memberUserId: string;
let tierConfigId: string;
/** A row dedicated to AC-1004 (service-role write) — independent of tierConfigId,
 * which AC-1000 re-reads and asserts is untouched by any scoped write. */
let tierConfigForServiceWriteId: string;

beforeAll(async () => {
  await rootSql`TRUNCATE TABLE "app_users","organizations","membership_tier_config","cafe_orders","bookings" RESTART IDENTITY CASCADE`;

  const [orgA] = await rootDb
    .insert(organizations)
    .values({ name: "RLS Write Org A", slug: "rls-write-org-a" })
    .returning();
  orgAId = orgA.id;

  const [orgB] = await rootDb
    .insert(organizations)
    .values({ name: "RLS Write Org B", slug: "rls-write-org-b" })
    .returning();
  orgBId = orgB.id;

  const [member] = await rootDb
    .insert(appUsers)
    .values({
      orgId: orgAId,
      email: "member@rls-write.test",
      name: "Scoped Member",
      role: "MEMBER",
      membershipTier: "REGULAR",
    })
    .returning();
  memberUserId = member.id;

  await rootDb.insert(appUsers).values({
    orgId: orgBId,
    email: "member-b@rls-write.test",
    name: "Org B Member",
    role: "MEMBER",
    membershipTier: "REGULAR",
  });

  const [tierConfig] = await rootDb
    .insert(membershipTierConfig)
    .values({
      orgId: orgAId,
      tier: "REGULAR",
      cafeDiscountPct: 5,
    })
    .returning();
  tierConfigId = tierConfig.id;

  const [tierConfigForServiceWrite] = await rootDb
    .insert(membershipTierConfig)
    .values({
      orgId: orgAId,
      tier: "GOLD",
      cafeDiscountPct: 15,
    })
    .returning();
  tierConfigForServiceWriteId = tierConfigForServiceWrite.id;

  // Realtime-subscribed tables (client reads via postgres_changes) — need a
  // row to prove scoped SELECT still works on them post-lockdown.
  await rootDb.insert(cafeOrders).values({
    orgId: orgAId,
    code: "RLS-WRITE-TEST-001",
    subtotalRupiah: 10_000,
    totalRupiah: 10_000,
  });

  await rootDb.insert(bookings).values({
    orgId: orgAId,
    userId: memberUserId,
    facilityType: "COWORKING_SEAT",
    facilityName: "Test Seat 1",
    ratePerHourRupiah: 15_000,
  });
}, 30_000);

afterAll(async () => {
  await rootSql`TRUNCATE TABLE "app_users","organizations","membership_tier_config","cafe_orders","bookings" RESTART IDENTITY CASCADE`;
  await rootSql.end();
}, 30_000);

/** Postgres error shape carries a `code` field (e.g. "42501" permission denied). */
type PgError = { code?: string; message?: string };

/**
 * Run `sqlText` inside a transaction scoped to `orgId` via the `authenticated`
 * role + JWT claim — exactly what a member's Supabase Data API request sees.
 */
async function runScoped(orgId: string, sqlText: string): Promise<unknown> {
  const claims = JSON.stringify({ org_id: orgId }).replace(/'/g, "''");
  return rootSql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE authenticated`);
    await tx.unsafe(`SET LOCAL "request.jwt.claims" = '${claims}'`);
    return tx.unsafe(sqlText);
  });
}

/**
 * Assert the scoped `sqlText` against `table` is denied specifically by the
 * ACL lockdown — not merely "some error happened" (which could mask an RLS
 * policy denial, a syntax error, or a flaky setup). Requires both pg error
 * code `42501` AND a message naming `table` ("permission denied for table
 * <table>"), which is what postgres emits ONLY for a missing table-level
 * grant — an RLS policy violation instead raises `42501` with a distinct
 * "new row violates row-level security policy" message.
 */
async function expectDenied(
  orgId: string,
  table: string,
  sqlText: string
): Promise<void> {
  let caught: PgError | undefined;
  try {
    await runScoped(orgId, sqlText);
  } catch (err) {
    caught = err as PgError;
  }
  expect(
    caught,
    `expected scoped write to "${table}" to be denied, but it succeeded`
  ).toBeDefined();
  expect(caught?.code).toBe("42501");
  expect(caught?.message).toMatch(
    new RegExp(`permission denied for table ${table}`, "i")
  );
}

describe("RLS write lockdown — scoped authenticated role cannot write", () => {
  it("AC-1000: scoped UPDATE on membership_tier_config is denied; value unchanged", async () => {
    await expectDenied(
      orgAId,
      "membership_tier_config",
      `UPDATE membership_tier_config SET cafe_discount_pct = 100 WHERE id = '${tierConfigId}'`
    );

    const [row] = await rootDb
      .select()
      .from(membershipTierConfig)
      .where(eq(membershipTierConfig.id, tierConfigId));
    expect(row.cafeDiscountPct).toBe(5);
  });

  it("AC-1001: scoped UPDATE self-upgrading membership_tier is denied; tier unchanged", async () => {
    await expectDenied(
      orgAId,
      "app_users",
      `UPDATE app_users SET membership_tier = 'GOLD' WHERE id = '${memberUserId}'`
    );

    const [row] = await rootDb
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, memberUserId));
    expect(row.membershipTier).toBe("REGULAR");
  });

  it.each(BUSINESS_TABLES)(
    "AC-1002: scoped write to %s is denied (INSERT/UPDATE/DELETE)",
    async (table) => {
      await expectDenied(
        orgAId,
        table,
        `INSERT INTO "${table}" DEFAULT VALUES`
      );
      await expectDenied(orgAId, table, `UPDATE "${table}" SET id = id WHERE false`);
      await expectDenied(orgAId, table, `DELETE FROM "${table}" WHERE false`);
    }
  );

  it("[SEC] time_credit_lots rejects scoped SELECT too (server-only, no Data-API grant — exposes other members' balances otherwise)", async () => {
    // time_credit_lots previously carried a SELECT grant to `authenticated`
    // (I-046/ADR-0015's default convention for new tables) — but a member's
    // Data API session could then read ANY member's lots in their own org
    // (no user_id filter in the RLS policy, only org_id), leaking other
    // members' balances/expiries. The dashboard reads the balance from the
    // derived app_users.timeCredits cache, never from lots directly, so the
    // client never legitimately needs this table — lock it down like the
    // print-agent credential tables (print_agent_configs pattern).
    let caught: PgError | undefined;
    const claims = JSON.stringify({ org_id: orgAId }).replace(/'/g, "''");
    try {
      await rootSql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE authenticated`);
        await tx.unsafe(`SET LOCAL "request.jwt.claims" = '${claims}'`);
        return tx.unsafe(`SELECT org_id FROM "time_credit_lots"`);
      });
    } catch (err) {
      caught = err as PgError;
    }
    expect(caught, `expected scoped SELECT on "time_credit_lots" to be denied`).toBeDefined();
    expect(caught?.code).toBe("42501");
    expect(caught?.message).toMatch(/permission denied for table time_credit_lots/i);
  });

  it("AC-1003: scoped SELECT still works, and excludes cross-org rows", async () => {
    const claims = JSON.stringify({ org_id: orgAId }).replace(/'/g, "''");
    const rows = await rootSql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE authenticated`);
      await tx.unsafe(`SET LOCAL "request.jwt.claims" = '${claims}'`);
      const users = await tx<{ email: string }[]>`SELECT email FROM app_users`;
      const tiers = await tx<
        { cafe_discount_pct: number }[]
      >`SELECT cafe_discount_pct FROM membership_tier_config`;
      const cafeOrderRows = await tx<
        { code: string }[]
      >`SELECT code FROM cafe_orders`;
      const bookingRows = await tx<
        { facility_name: string }[]
      >`SELECT facility_name FROM bookings`;
      return { users, tiers, cafeOrderRows, bookingRows };
    });

    // Own-org rows are visible.
    expect(rows.users.map((u) => u.email)).toContain("member@rls-write.test");
    expect(rows.tiers.map((t) => t.cafe_discount_pct)).toContain(5);

    // Cross-org exclusion: org A's scoped session never sees org B's user.
    expect(rows.users.map((u) => u.email)).not.toContain(
      "member-b@rls-write.test"
    );

    // The Realtime-subscribed tables (cafe_orders, bookings) still allow
    // scoped SELECT — client subscriptions depend on this staying granted.
    expect(rows.cafeOrderRows.map((o) => o.code)).toContain(
      "RLS-WRITE-TEST-001"
    );
    expect(rows.bookingRows.map((b) => b.facility_name)).toContain(
      "Test Seat 1"
    );
  });

  it("AC-1004: the service role (server authority) can still write membership_tier_config", async () => {
    await rootDb
      .update(membershipTierConfig)
      .set({ cafeDiscountPct: 25 })
      .where(eq(membershipTierConfig.id, tierConfigForServiceWriteId));

    const [row] = await rootDb
      .select()
      .from(membershipTierConfig)
      .where(eq(membershipTierConfig.id, tierConfigForServiceWriteId));
    expect(row.cafeDiscountPct).toBe(25);
  });
});
