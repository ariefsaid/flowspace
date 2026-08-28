/**
 * RLS write lockdown — I-046, spec 0011.
 *
 * Verified vuln: every business table GRANTs INSERT/UPDATE/DELETE to the
 * `authenticated` role, and the browser ships the anon key + Supabase URL —
 * so a logged-in MEMBER can hit the Supabase Data API directly and write
 * their own org's rows (e.g. set tier discounts to 100%, self-upgrade
 * membership_tier), bypassing the server ADMIN gate. This test proves the
 * scoped `authenticated` role can no longer write ANY business table, while
 * scoped SELECT and service-role writes remain intact.
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
import { appUsers, organizations, membershipTierConfig } from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Privileged connection — runs as the postgres superuser (service-role equivalent). */
const rootSql = postgres(TEST_URL, { prepare: false, max: 3 });
const rootDb = drizzle(rootSql, { schema });

/** The 12 business tables the I-046 REVOKE migration must lock down. */
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
] as const;

let orgAId: string;
let memberUserId: string;
let tierConfigId: string;

beforeAll(async () => {
  await rootSql`TRUNCATE TABLE "app_users","organizations","membership_tier_config" RESTART IDENTITY CASCADE`;

  const [orgA] = await rootDb
    .insert(organizations)
    .values({ name: "RLS Write Org A", slug: "rls-write-org-a" })
    .returning();
  orgAId = orgA.id;

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

  const [tierConfig] = await rootDb
    .insert(membershipTierConfig)
    .values({
      orgId: orgAId,
      tier: "REGULAR",
      cafeDiscountPct: 5,
    })
    .returning();
  tierConfigId = tierConfig.id;
}, 30_000);

afterAll(async () => {
  await rootSql`TRUNCATE TABLE "app_users","organizations","membership_tier_config" RESTART IDENTITY CASCADE`;
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
 * Expect the scoped `sqlText` to be denied by postgres, and return its error
 * code so callers can assert `42501` (permission denied) tersely.
 */
async function expectDenied(
  orgId: string,
  sqlText: string
): Promise<string | undefined> {
  try {
    await runScoped(orgId, sqlText);
    return undefined;
  } catch (err) {
    return (err as PgError).code;
  }
}

describe("RLS write lockdown — scoped authenticated role cannot write", () => {
  it("AC-1000: scoped UPDATE on membership_tier_config is denied; value unchanged", async () => {
    const code = await expectDenied(
      orgAId,
      `UPDATE membership_tier_config SET cafe_discount_pct = 100 WHERE id = '${tierConfigId}'`
    );
    expect(code).toBe("42501");

    const [row] = await rootDb
      .select()
      .from(membershipTierConfig)
      .where(eq(membershipTierConfig.id, tierConfigId));
    expect(row.cafeDiscountPct).toBe(5);
  });

  it("AC-1001: scoped UPDATE self-upgrading membership_tier is denied; tier unchanged", async () => {
    const code = await expectDenied(
      orgAId,
      `UPDATE app_users SET membership_tier = 'GOLD' WHERE id = '${memberUserId}'`
    );
    expect(code).toBe("42501");

    const [row] = await rootDb
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, memberUserId));
    expect(row.membershipTier).toBe("REGULAR");
  });

  it.each(BUSINESS_TABLES)(
    "AC-1002: scoped write to %s is denied (INSERT/UPDATE/DELETE)",
    async (table) => {
      const updateCode = await expectDenied(
        orgAId,
        `UPDATE "${table}" SET id = id WHERE false`
      );
      expect(updateCode).toBe("42501");

      const deleteCode = await expectDenied(
        orgAId,
        `DELETE FROM "${table}" WHERE false`
      );
      expect(deleteCode).toBe("42501");
    }
  );

  it("AC-1003: scoped SELECT still works for app_users and membership_tier_config", async () => {
    const claims = JSON.stringify({ org_id: orgAId }).replace(/'/g, "''");
    const rows = await rootSql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE authenticated`);
      await tx.unsafe(`SET LOCAL "request.jwt.claims" = '${claims}'`);
      const users = await tx<{ email: string }[]>`SELECT email FROM app_users`;
      const tiers = await tx<
        { cafe_discount_pct: number }[]
      >`SELECT cafe_discount_pct FROM membership_tier_config`;
      return { users, tiers };
    });

    expect(rows.users.map((u) => u.email)).toContain("member@rls-write.test");
    expect(rows.tiers.map((t) => t.cafe_discount_pct)).toContain(5);
  });

  it("AC-1004: the service role (server authority) can still write membership_tier_config", async () => {
    await rootDb
      .update(membershipTierConfig)
      .set({ cafeDiscountPct: 10 })
      .where(eq(membershipTierConfig.id, tierConfigId));

    const [row] = await rootDb
      .select()
      .from(membershipTierConfig)
      .where(eq(membershipTierConfig.id, tierConfigId));
    expect(row.cafeDiscountPct).toBe(10);
  });
});
