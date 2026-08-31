import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReportsData } from "@/lib/db/reports";

const { getReportsAction } = vi.hoisted(() => ({ getReportsAction: vi.fn() }));
vi.mock("./actions", () => ({ getReportsAction: (...args: unknown[]) => getReportsAction(...args) }));

import { ReportsClient } from "./ReportsClient";

const weeklyData: ReportsData = {
  period: "weekly",
  since: new Date("2026-08-01T00:00:00Z"),
  revenueTrend: [
    { bucket: "2026-08-25", amountRupiah: 40_000 },
    { bucket: "2026-08-31", amountRupiah: 60_000 },
  ],
  revenueByType: [
    { type: "BOOKING", amountRupiah: 70_000 },
    { type: "CAFE_ORDER", amountRupiah: 30_000 },
  ],
  bookingStats: [
    { status: "ACTIVE", count: 3 },
    { status: "COMPLETED", count: 7 },
  ],
  totalRevenueRupiah: 100_000,
  totalTransactions: 8,
};

const emptyData: ReportsData = {
  period: "daily",
  since: new Date("2026-08-24T00:00:00Z"),
  revenueTrend: [],
  revenueByType: [],
  bookingStats: [],
  totalRevenueRupiah: 0,
  totalTransactions: 0,
};

describe("ReportsClient", () => {
  beforeEach(() => {
    getReportsAction.mockReset();
  });

  it("renders the stat cards and the three chart titles for populated data", () => {
    render(<ReportsClient initialData={weeklyData} initialPeriod="weekly" />);
    expect(screen.getByText("Rp 100.000")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tren Pendapatan" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Pendapatan per Jenis" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Statistik Booking" })).toBeInTheDocument();
  });

  it("renders the empty-friendly message on every chart when there is no data", () => {
    render(<ReportsClient initialData={emptyData} initialPeriod="daily" />);
    expect(screen.getAllByText(/Belum ada data/).length).toBeGreaterThan(0);
  });

  it("re-queries via getReportsAction and swaps in the new data when the period changes", async () => {
    const monthlyData: ReportsData = {
      ...weeklyData,
      period: "monthly",
      revenueTrend: [{ bucket: "2026-08", amountRupiah: 500_000 }],
      totalRevenueRupiah: 500_000,
      totalTransactions: 42,
    };
    getReportsAction.mockResolvedValue(monthlyData);

    render(<ReportsClient initialData={weeklyData} initialPeriod="weekly" />);
    fireEvent.change(screen.getByLabelText("Pilih periode laporan"), { target: { value: "monthly" } });

    expect(getReportsAction).toHaveBeenCalledWith("monthly");
    await waitFor(() => expect(screen.getAllByText("Rp 500.000").length).toBeGreaterThan(0));
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows an error message and keeps the prior data when the re-query fails", async () => {
    getReportsAction.mockRejectedValue(new Error("boom"));
    render(<ReportsClient initialData={weeklyData} initialPeriod="weekly" />);
    fireEvent.change(screen.getByLabelText("Pilih periode laporan"), { target: { value: "daily" } });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // Prior data is still shown, not clobbered by the failed re-query.
    expect(screen.getByText("Rp 100.000")).toBeInTheDocument();
  });
});
