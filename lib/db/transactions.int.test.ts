/**
 * Integration tests for lib/db/transactions.ts (the member /history read path).
 *
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * AC-###: listTransactionsByUser returns only the caller org+user's rows,
 *         newest-first; cross-org/cross-user rows never leak.
 *
 * NOTE: do not run inside this worker — the integration suite shares one DB and
 * must run serially (vitest.config.ts `singleFork`). The Director runs
 * `pnpm test:int` in order.
 *
 * Harness mirrors lib/db/cafe.int.test.ts: dedicated testSql/testDb, TRUNCATE
 * …RESTART IDENTITY CASCADE incl the tables this surface reads/writes, seed
 * org A + org B.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { transactions, appUsers, organizations } from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

/** Dedicated Drizzle + postgres-js client for the test DB — never the app singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let bUserId: string;

beforeAll(async () => {
  // Wipe in FK-safe order (transactions reference app_users; CASCADE handles the rest).
  await testSql`TRUNCATE TABLE "transactions","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Hist Org A", slug: "hist-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Hist Org B", slug: "hist-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [userA] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: "hist-a@x.test", name: "Alice", role: "MEMBER" })
    .returning();
  const [userB] = await testDb
    .insert(appUsers)
    .values({ orgId: orgBId, email: "hist-b@x.test", name: "Bob", role: "MEMBER" })
    .returning();
  aUserId = userA.id;
  bUserId = userB.id;

  // A second user in org A — proves the read is user-scoped, not just org-scoped.
  const [userA2] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: "hist-a2@x.test", name: "A2", role: "MEMBER" })
    .returning();

  // Alice (org A): two COMPLETED rows at distinct times.
  const t0 = new Date("2026-06-15T10:00:00+07:00");
  const t1 = new Date("2026-06-15T12:00:00+07:00");
  await testDb.insert(transactions).values([
    {
      orgId: orgAId,
      userId: aUserId,
      type: "BOOKING",
      description: "Booking Meja A",
      amountRupiah: 30000,
      status: "COMPLETED",
      createdAt: t0,
    },
    {
      orgId: orgAId,
      userId: aUserId,
      type: "CAFE_ORDER",
      description: "Pesanan Cafe",
      amountRupiah: 89000,
      status: "COMPLETED",
      createdAt: t1,
    },
    // A second org-A user's row — must NOT appear for Alice.
    {
      orgId: orgAId,
      userId: userA2.id,
      type: "PRINT_JOB",
      description: "Other user print",
      amountRupiah: 5000,
      status: "COMPLETED",
      createdAt: t1,
    },
    // Org B row — must NOT appear for Alice (cross-org).
    {
      orgId: orgBId,
      userId: bUserId,
      type: "PACKAGE_PURCHASE",
      description: "Bob's package",
      amountRupiah: 140000,
      status: "COMPLETED",
      createdAt: t1,
    },
  ]);
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

import { listTransactionsByUser } from "@/lib/db/transactions";

describe("lib/db/transactions — listTransactionsByUser", () => {
  it("returns only the caller org+user's rows, newest-first (no cross-org/cross-user leak)", async () => {
    const rows = await listTransactionsByUser(orgAId, aUserId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.orgId === orgAId && r.userId === aUserId)).toBe(true);
    // Newest-first by createdAt.
    expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(
      rows[1].createdAt.getTime(),
    );
    // The other user's + org B's rows must not leak.
    expect(rows.map((r) => r.description)).not.toContain("Other user print");
    expect(rows.map((r) => r.description)).not.toContain("Bob's package");
  });

  it("returns an empty list for an org+user with no rows (no throw)", async () => {
    const rows = await listTransactionsByUser(orgAId, bUserId); // Bob is in org B
    expect(rows).toHaveLength(0);
  });
});
