/**
 * RLS backstop integration test (ADR-0015 §3, Task 4.2).
 *
 * AC-021 (RLS backstop): a cross-org row is invisible under a scoped
 * (claim=orgA) connection. The service role (server authority) still sees all.
 *
 * This is defense-in-depth, NOT the primary auth gate. The repository's
 * org_id WHERE clause (users.int.test.ts) is the authoritative AC-021 proof.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  appUsers,
  organizations,
  printers,
  orgPrintPricing,
  printJobs,
  printAgentConfigs,
  printAgentRateLimitEvents,
  printTopupPackages,
} from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Privileged connection — runs as the postgres superuser (service-role equivalent). */
const rootSql = postgres(TEST_URL, { prepare: false, max: 3 });
const rootDb = drizzle(rootSql, { schema });

let orgAId: string;
let orgBId: string;

beforeAll(async () => {
  // Truncate via raw sql to avoid Drizzle execute hang in vitest workers.
  await rootSql`TRUNCATE TABLE "app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await rootDb
    .insert(organizations)
    .values({ name: "RLS Org A", slug: "rls-org-a" })
    .returning();
  const [orgB] = await rootDb
    .insert(organizations)
    .values({ name: "RLS Org B", slug: "rls-org-b" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  await rootDb.insert(appUsers).values({
    orgId: orgAId,
    email: "a@x.test",
    name: "Alice",
    role: "MEMBER",
  });
  const [userB] = await rootDb.insert(appUsers).values({
    orgId: orgBId,
    email: "b@x.test",
    name: "Bob",
    role: "MEMBER",
  }).returning();
  const [userA] = await rootDb.select().from(appUsers).where(eq(appUsers.email, "a@x.test"));
  const [printer] = await rootDb.insert(printers).values({ orgId: orgAId, name: "rls-printer", displayName: "RLS Printer", colorSupport: false, paperSizes: ["A4"] }).returning();
  await rootDb.insert(orgPrintPricing).values({ orgId: orgAId, colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500 });
  const [config] = await rootDb.insert(printAgentConfigs).values({ orgId: orgAId, keySelector: "rls-selector", keyHash: "rls-hash" }).returning();
  await rootDb.insert(printAgentRateLimitEvents).values({ orgId: orgAId, configId: config.id });
  await rootDb.insert(printTopupPackages).values({ id: "rls-package", orgId: orgAId, pages: 10, priceRupiah: 10000 });
  await rootDb.insert(printJobs).values({ orgId: orgAId, userId: userA.id, fileName: "rls.pdf", pages: 1, copies: 1, totalPages: 1, colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, totalRupiah: 500, printerId: printer.id });
  // Keep the second user's variable referenced so the fixture remains explicit.
  expect(userB.orgId).toBe(orgBId);
}, 30_000);

afterAll(async () => {
  await rootSql`TRUNCATE TABLE "app_users","organizations" RESTART IDENTITY CASCADE`;
  await rootSql.end();
}, 30_000);

/**
 * Execute a query inside a transaction scoped to `orgId` via the `authenticated`
 * role + JWT claim.  Returns the rows from `app_users` SELECT — exactly what
 * we need for the RLS proof without trying to re-wrap the tx in Drizzle
 * (the postgres-js transaction object is not a connection and cannot be passed
 * to `drizzle(tx)`).
 */
async function selectUsersScoped(
  orgId: string
): Promise<{ email: string }[]> {
  // SET LOCAL only works inside a transaction.
  // org_id values are CUID strings (alphanumeric + hyphens) — safe to embed.
  const claims = JSON.stringify({ org_id: orgId }).replace(/'/g, "''");
  return rootSql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE authenticated`);
    await tx.unsafe(`SET LOCAL "request.jwt.claims" = '${claims}'`);
    return tx<{ email: string }[]>`SELECT email FROM app_users`;
  });
}

/**
 * Same scoped pattern as selectUsersScoped, but over `organizations` — proves the
 * M-2 organizations RLS backstop: an authenticated request scoped to org A can
 * read ONLY its own organization row, never org B's.
 */
async function selectOrgsScoped(
  orgId: string
): Promise<{ id: string; name: string }[]> {
  const claims = JSON.stringify({ org_id: orgId }).replace(/'/g, "''");
  return rootSql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE authenticated`);
    await tx.unsafe(`SET LOCAL "request.jwt.claims" = '${claims}'`);
    return tx<{ id: string; name: string }[]>`SELECT id, name FROM organizations`;
  });
}

describe("RLS backstop — org isolation on app_users", () => {
  it("AC-021 (RLS backstop): scoped role sees only its org's rows", async () => {
    const rows = await selectUsersScoped(orgAId);
    const emails = rows.map((r) => r.email);
    expect(emails).toContain("a@x.test");
    expect(emails).not.toContain("b@x.test"); // org B hidden by RLS
  });

  it("service role (postgres superuser) sees all rows across orgs", async () => {
    const rows = await rootDb.select().from(appUsers);
    const emails = rows.map((r) => r.email);
    expect(emails).toContain("a@x.test");
    expect(emails).toContain("b@x.test");
  });
});

describe("RLS backstop — I-043 print tables", () => {
  it("AC-632: scoped org claims isolate printers, pricing, jobs, and packages", async () => {
    // print_agent_configs / print_agent_rate_limit_events are deliberately
    // NOT in this list — they carry zero Data-API grant at all (see below).
    const tables = ["printers", "org_print_pricing", "print_jobs", "print_topup_packages"];
    for (const table of tables) {
      const rows = await selectScopedOrgIds(table);
      expect(rows.every((row) => row.org_id === orgAId)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
    }
    const symmetric = await selectScopedOrgIds("printers", orgBId);
    expect(symmetric).toHaveLength(0);
  });

  it("AC-632: print_agent_configs and print_agent_rate_limit_events reject scoped SELECT too (server-only, no Data-API grant)", async () => {
    // These carry credentials (key_hash/key_selector) — the admin page reads
    // them via the service-role connection only. Unlike the write-lockdown
    // tables, `authenticated` gets NO grant here at all, not even SELECT.
    for (const table of ["print_agent_configs", "print_agent_rate_limit_events"]) {
      let caught: { code?: string; message?: string } | undefined;
      const claims = JSON.stringify({ org_id: orgAId }).replace(/'/g, "''");
      try {
        await rootSql.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL ROLE authenticated`);
          await tx.unsafe(`SET LOCAL "request.jwt.claims" = '${claims}'`);
          return tx.unsafe(`SELECT org_id FROM "${table}"`);
        });
      } catch (err) {
        caught = err as { code?: string; message?: string };
      }
      expect(caught, `expected scoped SELECT on "${table}" to be denied`).toBeDefined();
      expect(caught?.code).toBe("42501");
      expect(caught?.message).toMatch(new RegExp(`permission denied for table ${table}`, "i"));
    }

    // The service role (server authority) still reads both — the admin
    // print-server page depends on this.
    const configRows = await rootDb.select().from(printAgentConfigs);
    expect(configRows.some((r) => r.orgId === orgAId)).toBe(true);
    const rateEventRows = await rootDb.select().from(printAgentRateLimitEvents);
    expect(rateEventRows.some((r) => r.orgId === orgAId)).toBe(true);
  });
});

async function selectScopedOrgIds(table: string, orgId = orgAId): Promise<{ org_id: string }[]> {
  const allowed = new Set(["printers", "org_print_pricing", "print_jobs", "print_topup_packages"]);
  if (!allowed.has(table)) throw new Error("invalid test table");
  const claims = JSON.stringify({ org_id: orgId }).replace(/'/g, "''");
  return rootSql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE authenticated`);
    await tx.unsafe(`SET LOCAL "request.jwt.claims" = '${claims}'`);
    return tx.unsafe(`SELECT org_id FROM "${table}"`) as Promise<{ org_id: string }[]>;
  });
}

describe("RLS backstop — org isolation on organizations (M-2)", () => {
  it("M-2: a scoped authenticated role sees ONLY its own organization row", async () => {
    // Claim = org A → may read org A's row, never org B's.
    const rowsA = await selectOrgsScoped(orgAId);
    const idsA = rowsA.map((r) => r.id);
    expect(idsA).toContain(orgAId);
    expect(idsA).not.toContain(orgBId); // org B hidden by the new RLS policy

    // And the symmetric check from org B's perspective.
    const rowsB = await selectOrgsScoped(orgBId);
    const idsB = rowsB.map((r) => r.id);
    expect(idsB).toContain(orgBId);
    expect(idsB).not.toContain(orgAId);
  });

  it("M-2: the privileged connection (server authority) still sees all orgs", async () => {
    const rows = await rootDb.select().from(organizations);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(orgAId);
    expect(ids).toContain(orgBId);
  });
});
