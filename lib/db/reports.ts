/**
 * Repository: admin analytics aggregates (I-048, /admin/reports).
 *
 * Read-only, org-scoped aggregates over `transactions` (revenue, bucketed by
 * day/week/month) and `bookings` (counts by status). Mirrors the ORIG
 * behavior oracle (app/admin/reports): COMPLETED-only revenue (the same
 * semantics as `sumRevenueSince` in lib/db/transactions.ts), a
 * daily/weekly/monthly period window, and booking counts by status over the
 * same window.
 *
 * Divergence from ORIG (documented, not a defect): ORIG loaded every
 * transaction row in the window into Node and bucketed it in JS, keyed by a
 * Sunday-start week. This repo buckets server-side with Postgres
 * `date_trunc` (bounded aggregate result set, no row cap needed) — buckets
 * are Monday-start for `weekly` (Postgres ISO week), a cosmetic difference
 * only; the chart still reads the same trend.
 *
 * All reads are org-scoped (server-derived orgId, never client). [SEC]
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { transactions, bookings } from "@/lib/db/schema";
import type { TransactionType, BookingStatus } from "@/lib/db/enums";

export type ReportPeriod = "daily" | "weekly" | "monthly";

export type RevenueBucket = { bucket: string; amountRupiah: number };
export type RevenueByType = { type: TransactionType; amountRupiah: number };
export type BookingStatusCount = { status: BookingStatus; count: number };

export type ReportsData = {
  period: ReportPeriod;
  since: Date;
  revenueTrend: RevenueBucket[];
  revenueByType: RevenueByType[];
  bookingStats: BookingStatusCount[];
  totalRevenueRupiah: number;
  totalTransactions: number;
};

const TRUNC_UNIT: Record<ReportPeriod, "day" | "week" | "month"> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

/** `to_char` format per period — day/week buckets key on the bucket's start
 *  date; monthly buckets key on year-month (matches the ORIG key shapes). */
const BUCKET_FORMAT: Record<ReportPeriod, string> = {
  daily: "YYYY-MM-DD",
  weekly: "YYYY-MM-DD",
  monthly: "YYYY-MM",
};

/** Start-of-window for a period, relative to `now` (daily=7d, weekly=28d, monthly=12mo — ORIG's windows). */
export function sinceForPeriod(period: ReportPeriod, now: Date = new Date()): Date {
  const d = new Date(now);
  switch (period) {
    case "daily":
      d.setDate(d.getDate() - 7);
      break;
    case "weekly":
      d.setDate(d.getDate() - 28);
      break;
    case "monthly":
      d.setMonth(d.getMonth() - 12);
      break;
  }
  return d;
}

/**
 * Org-scoped analytics for `/admin/reports`: revenue trend (bucketed),
 * revenue by transaction type, booking counts by status, and totals.
 * COMPLETED-only for every revenue figure (PENDING transactions excluded —
 * the same semantics as `sumRevenueSince`). Bounded: each query aggregates
 * over an indexed org+created_at (+status) window into a small result set
 * (at most one row per bucket/type/status), never an unbounded row scan.
 */
export async function getReportsData(
  orgId: string,
  period: ReportPeriod,
  now: Date = new Date(),
): Promise<ReportsData> {
  const since = sinceForPeriod(period, now);
  const trunc = TRUNC_UNIT[period];
  const fmt = BUCKET_FORMAT[period];

  const revenueFilter = and(
    eq(transactions.orgId, orgId),
    eq(transactions.status, "COMPLETED"),
    gte(transactions.createdAt, since),
  );

  // The date_trunc UNIT is inlined as a SQL literal (not a bind param) so the
  // identical expression appears in select/group/order. Interpolating `trunc`
  // as `${trunc}` makes Drizzle emit distinct bind params ($1 vs $6), which
  // Postgres treats as different expressions → 42803 "must appear in GROUP BY".
  // `trunc` is TRUNC_UNIT[period] (a validated enum → 'day'|'week'|'month'),
  // never user input, so raw-inlining is injection-safe.
  const bucket = sql`date_trunc(${sql.raw(`'${trunc}'`)}, ${transactions.createdAt})`;

  const [revenueTrend, revenueByType, bookingStats, totals] = await Promise.all([
    db
      .select({
        bucket: sql<string>`to_char(${bucket}, ${fmt})`,
        amountRupiah: sql<number>`coalesce(sum(${transactions.amountRupiah}), 0)::int`,
      })
      .from(transactions)
      .where(revenueFilter)
      .groupBy(bucket)
      .orderBy(bucket),

    db
      .select({
        type: transactions.type,
        amountRupiah: sql<number>`coalesce(sum(${transactions.amountRupiah}), 0)::int`,
      })
      .from(transactions)
      .where(revenueFilter)
      .groupBy(transactions.type),

    db
      .select({
        status: bookings.status,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(and(eq(bookings.orgId, orgId), gte(bookings.createdAt, since)))
      .groupBy(bookings.status),

    db
      .select({
        totalRevenueRupiah: sql<number>`coalesce(sum(${transactions.amountRupiah}), 0)::int`,
        totalTransactions: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(revenueFilter),
  ]);

  return {
    period,
    since,
    revenueTrend,
    revenueByType,
    bookingStats,
    totalRevenueRupiah: totals[0]?.totalRevenueRupiah ?? 0,
    totalTransactions: totals[0]?.totalTransactions ?? 0,
  };
}
