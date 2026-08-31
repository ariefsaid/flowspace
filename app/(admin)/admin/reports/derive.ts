/**
 * Pure presentational mappers for /admin/reports (I-048) — turns
 * lib/db/reports.ts rows into the {label, value, color?} shape the inline-SVG
 * charts (components/admin/charts) consume, plus Indonesian labels.
 */
import type { ChartDatum } from "@/components/admin/charts";
import type { ReportPeriod, RevenueBucket, RevenueByType, BookingStatusCount } from "@/lib/db/reports";
import type { TransactionType, BookingStatus } from "@/lib/db/enums";

export const REPORT_PERIODS: ReportPeriod[] = ["daily", "weekly", "monthly"];

export function periodLabel(period: ReportPeriod): string {
  switch (period) {
    case "daily":
      return "7 Hari Terakhir";
    case "weekly":
      return "4 Minggu Terakhir";
    case "monthly":
      return "12 Bulan Terakhir";
  }
}

export function transactionTypeLabel(type: TransactionType): string {
  switch (type) {
    case "PACKAGE_PURCHASE":
      return "Pembelian Paket";
    case "CAFE_ORDER":
      return "Pesanan Cafe";
    case "PRINT_JOB":
      return "Print";
    case "BOOKING":
      return "Booking";
    case "PRINT_TOPUP":
      return "Top-up Print";
  }
}

export function bookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case "ACTIVE":
      return "Aktif";
    case "COMPLETED":
      return "Selesai";
    case "CANCELLED":
      return "Dibatalkan";
    case "PENDING":
      return "Menunggu";
    case "CONFIRMED":
      return "Dikonfirmasi";
  }
}

/** Mirrors the app's existing status-badge tones (DESIGN.md): teal=active,
 *  green=completed, red=cancelled, amber=pending, blue=confirmed/info. */
export function bookingStatusColor(status: BookingStatus): string {
  switch (status) {
    case "ACTIVE":
      return "var(--color-teal-500)";
    case "COMPLETED":
      return "var(--color-green-500)";
    case "CANCELLED":
      return "var(--color-red-500)";
    case "PENDING":
      return "var(--color-amber-500)";
    case "CONFIRMED":
      return "var(--color-blue-500)";
  }
}

const dayMonthFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const monthYearFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Format a bucket key ("YYYY-MM-DD" for daily/weekly, "YYYY-MM" for monthly)
 *  into a short chart-axis label, e.g. "31 Agu" or "Agu 2026". */
export function bucketLabel(bucket: string, period: ReportPeriod): string {
  if (period === "monthly") {
    return monthYearFormatter.format(new Date(`${bucket}-01T00:00:00Z`));
  }
  return dayMonthFormatter.format(new Date(`${bucket}T00:00:00Z`));
}

export function toRevenueTrendSeries(rows: RevenueBucket[], period: ReportPeriod): ChartDatum[] {
  return rows.map((r) => ({ label: bucketLabel(r.bucket, period), value: r.amountRupiah }));
}

export function toRevenueByTypeSeries(rows: RevenueByType[]): ChartDatum[] {
  return rows.map((r) => ({ label: transactionTypeLabel(r.type), value: r.amountRupiah }));
}

export function toBookingStatsSeries(rows: BookingStatusCount[]): ChartDatum[] {
  return rows.map((r) => ({
    label: bookingStatusLabel(r.status),
    value: r.count,
    color: bookingStatusColor(r.status),
  }));
}
