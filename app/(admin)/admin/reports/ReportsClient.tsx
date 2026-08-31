"use client";

import { useState, useTransition } from "react";
import { Banknote, Receipt } from "lucide-react";
import { StatTile, Card, Select } from "@/components/ui";
import { BarChart, LineChart, DonutChart } from "@/components/admin/charts";
import { formatRupiah } from "@/lib/format";
import type { ReportsData, ReportPeriod } from "@/lib/db/reports";
import { getReportsAction } from "./actions";
import {
  REPORT_PERIODS,
  periodLabel,
  toRevenueTrendSeries,
  toRevenueByTypeSeries,
  toBookingStatsSeries,
} from "./derive";

export interface ReportsClientProps {
  initialData: ReportsData;
  initialPeriod: ReportPeriod;
}

/**
 * Admin analytics page body (I-048). The period selector re-queries via
 * `getReportsAction` (a server action) rather than a full navigation, so the
 * charts swap in place; the prior data stays on screen if the re-query fails.
 */
export function ReportsClient({ initialData, initialPeriod }: ReportsClientProps) {
  const [data, setData] = useState<ReportsData>(initialData);
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePeriodChange(next: ReportPeriod) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await getReportsAction(next);
        setData(result);
        setPeriod(next);
      } catch {
        setError("Gagal memuat laporan untuk periode ini. Coba lagi.");
      }
    });
  }

  const revenueTrend = toRevenueTrendSeries(data.revenueTrend, data.period);
  const revenueByType = toRevenueByTypeSeries(data.revenueByType);
  const bookingStats = toBookingStatsSeries(data.bookingStats);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Laporan</h1>
          <p className="mt-1 text-sm text-gray-500">Analitik pendapatan dan booking</p>
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="reports-period" className="sr-only">
            Pilih periode laporan
          </label>
          <Select
            id="reports-period"
            aria-label="Pilih periode laporan"
            value={period}
            disabled={isPending}
            onChange={(e) => handlePeriodChange(e.target.value as ReportPeriod)}
          >
            {REPORT_PERIODS.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile label="Total Pendapatan" value={formatRupiah(data.totalRevenueRupiah)} icon={Banknote} accent="teal" />
        <StatTile label="Total Transaksi" value={data.totalTransactions} unit="transaksi" icon={Receipt} accent="orange" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Tren Pendapatan</h2>
          <LineChart
            title="Tren Pendapatan"
            seriesLabel="Pendapatan"
            data={revenueTrend}
            valueHeader="Pendapatan"
            formatValue={formatRupiah}
          />
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Pendapatan per Jenis</h2>
          <DonutChart title="Pendapatan per Jenis" data={revenueByType} valueHeader="Pendapatan" formatValue={formatRupiah} />
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Statistik Booking</h2>
          <BarChart title="Statistik Booking" data={bookingStats} valueHeader="Jumlah" />
        </Card>
      </div>
    </div>
  );
}

export default ReportsClient;
