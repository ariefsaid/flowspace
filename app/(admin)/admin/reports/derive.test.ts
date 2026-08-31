import { describe, expect, it } from "vitest";
import {
  periodLabel,
  transactionTypeLabel,
  bookingStatusLabel,
  bookingStatusColor,
  bucketLabel,
  toRevenueTrendSeries,
  toRevenueByTypeSeries,
  toBookingStatsSeries,
} from "./derive";

describe("derive — periodLabel", () => {
  it("labels each period in Indonesian", () => {
    expect(periodLabel("daily")).toBe("7 Hari Terakhir");
    expect(periodLabel("weekly")).toBe("4 Minggu Terakhir");
    expect(periodLabel("monthly")).toBe("12 Bulan Terakhir");
  });
});

describe("derive — transactionTypeLabel", () => {
  it("maps every TransactionType to an Indonesian label", () => {
    expect(transactionTypeLabel("PACKAGE_PURCHASE")).toBe("Pembelian Paket");
    expect(transactionTypeLabel("CAFE_ORDER")).toBe("Pesanan Cafe");
    expect(transactionTypeLabel("PRINT_JOB")).toBe("Print");
    expect(transactionTypeLabel("BOOKING")).toBe("Booking");
    expect(transactionTypeLabel("PRINT_TOPUP")).toBe("Top-up Print");
  });
});

describe("derive — bookingStatusLabel / bookingStatusColor", () => {
  it("maps every BookingStatus to an Indonesian label", () => {
    expect(bookingStatusLabel("ACTIVE")).toBe("Aktif");
    expect(bookingStatusLabel("COMPLETED")).toBe("Selesai");
    expect(bookingStatusLabel("CANCELLED")).toBe("Dibatalkan");
    expect(bookingStatusLabel("PENDING")).toBe("Menunggu");
    expect(bookingStatusLabel("CONFIRMED")).toBe("Dikonfirmasi");
  });

  it("gives each status a distinct CSS-var color", () => {
    const statuses = ["ACTIVE", "COMPLETED", "CANCELLED", "PENDING", "CONFIRMED"] as const;
    const colors = new Set(statuses.map(bookingStatusColor));
    expect(colors.size).toBe(statuses.length);
    for (const c of colors) expect(c).toMatch(/^var\(--color-/);
  });
});

describe("derive — bucketLabel", () => {
  it("formats a daily/weekly bucket (YYYY-MM-DD) as short day + month", () => {
    expect(bucketLabel("2026-08-31", "daily")).toBe("31 Agu");
    expect(bucketLabel("2026-08-31", "weekly")).toBe("31 Agu");
  });

  it("formats a monthly bucket (YYYY-MM) as short month + year", () => {
    expect(bucketLabel("2026-08", "monthly")).toBe("Agu 2026");
  });
});

describe("derive — series mappers", () => {
  it("toRevenueTrendSeries maps bucket+amountRupiah to {label, value} using the period's bucket format", () => {
    const series = toRevenueTrendSeries(
      [
        { bucket: "2026-08-30", amountRupiah: 10_000 },
        { bucket: "2026-08-31", amountRupiah: 25_000 },
      ],
      "daily",
    );
    expect(series).toEqual([
      { label: "30 Agu", value: 10_000 },
      { label: "31 Agu", value: 25_000 },
    ]);
  });

  it("toRevenueByTypeSeries maps type+amountRupiah to {label, value, color}", () => {
    const series = toRevenueByTypeSeries([
      { type: "BOOKING", amountRupiah: 50_000 },
      { type: "CAFE_ORDER", amountRupiah: 30_000 },
    ]);
    expect(series[0]).toMatchObject({ label: "Booking", value: 50_000 });
    expect(series[1]).toMatchObject({ label: "Pesanan Cafe", value: 30_000 });
  });

  it("toBookingStatsSeries maps status+count to {label, value, color} using the shared status palette", () => {
    const series = toBookingStatsSeries([
      { status: "ACTIVE", count: 4 },
      { status: "COMPLETED", count: 9 },
    ]);
    expect(series[0]).toEqual({ label: "Aktif", value: 4, color: bookingStatusColor("ACTIVE") });
    expect(series[1]).toEqual({ label: "Selesai", value: 9, color: bookingStatusColor("COMPLETED") });
  });
});
