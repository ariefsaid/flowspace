/**
 * Integration tests for lib/db/reports.ts (I-048, /admin/reports aggregates).
 *
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * AC-RPT-01: getReportsData sums COMPLETED-only revenue into totalRevenueRupiah/
 *            totalTransactions for the period window (PENDING excluded — the
 *            same semantics as sumRevenueSince).
 * AC-RPT-02: revenueByType groups COMPLETED-only amounts by transaction type,
 *            within the period window.
 * AC-RPT-03: bookingStats counts bookings by status within the period window,
 *            org-scoped (org B's booking never counted for org A).
 * AC-RPT-04: the period window bounds revenueTrend/totals — a transaction
 *            outside the daily window is excluded from a "daily" call but
 *            included in a "monthly" call that covers it.
 * AC-RPT-05: org isolation — org B's transactions/bookings never leak into
 *            org A's report at any period, and vice versa.
 *
 * NOTE: do not run inside this worker — the integration suite shares one DB and
 * must run serially (vitest.config.ts `singleFork`). The Director runs
 * `pnpm test:int` in order.
 *
 * Harness mirrors lib/db/transactions.int.test.ts: dedicated testSql/testDb,
 * TRUNCATE …RESTART IDENTITY CASCADE incl the tables this surface reads,
 * seed org A + org B. `getReportsData` takes an explicit `now` so bucket/window
 * math is deterministic regardless of wall-clock time.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { transactions, bookings, appUsers, organizations } from "@/lib/db/schema";
import { getReportsData } from "@/lib/db/reports";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Dedicated Drizzle + postgres-js client for the test DB — never the app singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

// Fixed instant so daily(7d)/weekly(28d)/monthly(12mo) windows are deterministic.
const NOW = new Date("2026-01-15T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let bUserId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Reports Org A", slug: "reports-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Reports Org B", slug: "reports-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [userA] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: "reports-a@x.test", name: "Alice", role: "MEMBER" })
    .returning();
  const [userB] = await testDb
    .insert(appUsers)
    .values({ orgId: orgBId, email: "reports-b@x.test", name: "Bob", role: "MEMBER" })
    .returning();
  aUserId = userA.id;
  bUserId = userB.id;

  // Org A transactions: two COMPLETED rows inside the daily(7d)/weekly(28d)
  // window (one BOOKING, one CAFE_ORDER), one PENDING row inside the window
  // (must be excluded from every revenue figure), one COMPLETED row 40 days
  // back — outside daily/weekly, inside monthly(12mo).
  await testDb.insert(transactions).values([
    {
      orgId: orgAId,
      userId: aUserId,
      type: "BOOKING",
      description: "Booking Meja A",
      amountRupiah: 50_000,
      status: "COMPLETED",
      createdAt: daysAgo(2),
    },
    {
      orgId: orgAId,
      userId: aUserId,
      type: "CAFE_ORDER",
      description: "Pesanan Cafe",
      amountRupiah: 30_000,
      status: "COMPLETED",
      createdAt: daysAgo(1),
    },
    {
      orgId: orgAId,
      userId: aUserId,
      type: "BOOKING",
      description: "Belum lunas",
      amountRupiah: 99_999,
      status: "PENDING",
      createdAt: daysAgo(1),
    },
    {
      orgId: orgAId,
      userId: aUserId,
      type: "BOOKING",
      description: "40 hari lalu",
      amountRupiah: 77_777,
      status: "COMPLETED",
      createdAt: daysAgo(40),
    },
  ]);

  // Org B transaction, well inside every window — must never leak into org A's report.
  await testDb.insert(transactions).values([
    {
      orgId: orgBId,
      userId: bUserId,
      type: "BOOKING",
      description: "Org B booking",
      amountRupiah: 123_456,
      status: "COMPLETED",
      createdAt: daysAgo(1),
    },
  ]);

  // Org A bookings: ACTIVE + COMPLETED inside the daily window, PENDING 40 days back.
  await testDb.insert(bookings).values([
    {
      orgId: orgAId,
      userId: aUserId,
      facilityType: "COWORKING_SEAT",
      facilityName: "Meja 1",
      ratePerHourRupiah: 10_000,
      status: "ACTIVE",
      createdAt: daysAgo(1),
    },
    {
      orgId: orgAId,
      userId: aUserId,
      facilityType: "MEETING_ROOM",
      facilityName: "Ruang Rapat 1",
      ratePerHourRupiah: 50_000,
      status: "COMPLETED",
      createdAt: daysAgo(2),
    },
    {
      orgId: orgAId,
      userId: aUserId,
      facilityType: "COWORKING_SEAT",
      facilityName: "Meja 2",
      ratePerHourRupiah: 10_000,
      status: "PENDING",
      createdAt: daysAgo(40),
    },
  ]);

  // Org B booking — must never leak into org A's bookingStats.
  await testDb.insert(bookings).values([
    {
      orgId: orgBId,
      userId: bUserId,
      facilityType: "COWORKING_SEAT",
      facilityName: "Org B Meja",
      ratePerHourRupiah: 10_000,
      status: "ACTIVE",
      createdAt: daysAgo(1),
    },
  ]);
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("lib/db/reports — getReportsData", () => {
  it("AC-RPT-01: sums COMPLETED-only revenue for the window (PENDING excluded)", async () => {
    const data = await getReportsData(orgAId, "daily", NOW);
    expect(data.totalRevenueRupiah).toBe(50_000 + 30_000);
    expect(data.totalTransactions).toBe(2);
  });

  it("AC-RPT-02: revenueByType groups COMPLETED amounts by type within the window", async () => {
    const data = await getReportsData(orgAId, "daily", NOW);
    const byType = new Map(data.revenueByType.map((r) => [r.type, r.amountRupiah]));
    expect(byType.get("BOOKING")).toBe(50_000);
    expect(byType.get("CAFE_ORDER")).toBe(30_000);
    // The PENDING BOOKING row must not inflate the BOOKING bucket.
    expect(byType.get("BOOKING")).not.toBe(50_000 + 99_999);
  });

  it("AC-RPT-03: bookingStats counts by status within the window, org-scoped", async () => {
    const data = await getReportsData(orgAId, "daily", NOW);
    const byStatus = new Map(data.bookingStats.map((r) => [r.status, r.count]));
    expect(byStatus.get("ACTIVE")).toBe(1);
    expect(byStatus.get("COMPLETED")).toBe(1);
    // The 40-day-old PENDING booking is outside the daily window.
    expect(byStatus.get("PENDING")).toBeUndefined();
    // Org B's ACTIVE booking must not be counted here.
    const totalCount = data.bookingStats.reduce((sum, r) => sum + r.count, 0);
    expect(totalCount).toBe(2);
  });

  it("AC-RPT-04: the period window bounds the aggregate — a 40-day-old row is excluded daily/weekly, included monthly", async () => {
    const daily = await getReportsData(orgAId, "daily", NOW);
    const weekly = await getReportsData(orgAId, "weekly", NOW);
    const monthly = await getReportsData(orgAId, "monthly", NOW);

    expect(daily.totalRevenueRupiah).toBe(80_000);
    expect(weekly.totalRevenueRupiah).toBe(80_000);
    // Monthly (12mo) additionally covers the 40-day-old COMPLETED row.
    expect(monthly.totalRevenueRupiah).toBe(80_000 + 77_777);
    expect(monthly.totalTransactions).toBe(3);
  });

  it("AC-RPT-05: org isolation — org B's rows never leak into org A's report, and vice versa", async () => {
    const orgAData = await getReportsData(orgAId, "monthly", NOW);
    // Org A's exact known total (80_000 + 77_777) — org B's 123_456 is not summed in.
    expect(orgAData.totalRevenueRupiah).toBe(157_777);
    const revenueTrendTotal = orgAData.revenueTrend.reduce((sum, r) => sum + r.amountRupiah, 0);
    expect(revenueTrendTotal).toBe(orgAData.totalRevenueRupiah);

    const orgBData = await getReportsData(orgBId, "monthly", NOW);
    expect(orgBData.totalRevenueRupiah).toBe(123_456);
    expect(orgBData.totalTransactions).toBe(1);
    expect(orgBData.bookingStats.reduce((sum, r) => sum + r.count, 0)).toBe(1);
  });
});
