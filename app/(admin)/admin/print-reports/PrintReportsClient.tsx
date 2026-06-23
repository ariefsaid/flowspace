"use client";

import {
  Printer,
  FileText,
  Banknote,
  Users,
  TrendingUp,
  Inbox,
} from "lucide-react";
import { StatTile, Badge, Card } from "@/components/ui";
import { formatRupiah, formatDateID } from "@/lib/format";
import type { PrintColorMode, PrintJobStatus } from "@/lib/db/enums";
import type { AdminPrintJobView, PrintReportsSummary } from "./derive";

export type { AdminPrintJobView, PrintReportsSummary };

// ---------------------------------------------------------------------------
// Pure presentational mappers (AC-302) — exported for unit coverage.
// ---------------------------------------------------------------------------

export function colorModeLabel(mode: PrintColorMode): "Warna" | "B/W" {
  return mode === "COLOR" ? "Warna" : "B/W";
}

/** Derived display percentage; 0 when no discount or unknown gross. */
export function discountPercent(discountRupiah: number, grossRupiah: number): number {
  if (discountRupiah <= 0 || grossRupiah <= 0) return 0;
  return Math.round((discountRupiah / grossRupiah) * 100);
}

export function statusTone(
  status: PrintJobStatus,
): "pending" | "active" | "completed" {
  switch (status) {
    case "PENDING":
      return "pending";
    case "READY":
      return "active";
    case "COMPLETED":
      return "completed";
  }
}

export function statusLabel(status: PrintJobStatus): string {
  switch (status) {
    case "PENDING":
      return "Menunggu";
    case "READY":
      return "Siap Ambil";
    case "COMPLETED":
      return "Selesai";
  }
}

// ---------------------------------------------------------------------------
// Page body
// ---------------------------------------------------------------------------

export function PrintReportsClient({
  jobs,
  summary,
}: {
  jobs: AdminPrintJobView[];
  summary: PrintReportsSummary;
}) {
  const isEmpty = jobs.length === 0;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Laporan Print</h1>
        <p className="mt-1 text-sm text-gray-500">
          Riwayat pekerjaan cetak per pengguna beserta rincian biaya
        </p>
      </div>

      {/* Summary stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total Pekerjaan"
          value={summary.totalJobs}
          unit="job"
          icon={Printer}
          accent="teal"
        />
        <StatTile
          label="Total Halaman"
          value={summary.totalPages}
          unit="hlm"
          icon={FileText}
          accent="blue"
        />
        <StatTile
          label="Pengguna Aktif"
          value={summary.uniqueUsers}
          unit="pengguna"
          icon={Users}
          accent="teal"
        />
        <StatTile
          label="Pendapatan Print"
          value={formatRupiah(summary.totalRevenue)}
          icon={Banknote}
          accent="green"
        />
      </div>

      {/* Revenue highlight card */}
      <div className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-teal-800 to-teal-900 p-4 shadow-md text-white">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">
            Total Pendapatan Print (Selesai)
          </p>
          <p className="mt-1 truncate text-2xl font-bold">
            {formatRupiah(summary.totalRevenue)}
          </p>
          <p className="mt-0.5 text-xs text-white">
            dari {summary.completedCount} job selesai
          </p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <TrendingUp className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
      </div>

      {/* Print jobs table */}
      <Card className="p-0 overflow-hidden">
        {/* Card header */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-200">
          <Printer className="h-5 w-5 text-teal-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-gray-800">
            Daftar Pekerjaan Print
          </h2>
          <span className="ml-auto text-xs text-gray-400">
            {summary.totalJobs} job
          </span>
        </div>

        {/* Empty state */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50">
              <Inbox className="h-7 w-7 text-teal-400" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              Belum ada pekerjaan print
            </p>
            <p className="text-xs text-gray-400 max-w-xs">
              Data pekerjaan cetak per pengguna akan muncul di sini setelah ada
              aktivitas print.
            </p>
          </div>
        ) : (
          /* Responsive table wrapper */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Pengguna
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Nama File
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Halaman
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Mode
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Kertas
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Diskon
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Biaya
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Waktu
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {jobs.map((job) => {
                  const pct = discountPercent(job.discountRupiah, job.grossRupiah);
                  return (
                    <tr
                      key={job.id}
                      className="transition-colors hover:bg-slate-50/60"
                    >
                      {/* User */}
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {job.user}
                      </td>

                      {/* Filename */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <span
                          className="block truncate text-sm text-gray-700"
                          title={job.fileName}
                        >
                          {job.fileName}
                        </span>
                      </td>

                      {/* Pages */}
                      <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums whitespace-nowrap">
                        {job.pages} hlm
                      </td>

                      {/* Color mode */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span
                          className={
                            job.colorMode === "COLOR"
                              ? "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700"
                              : "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600"
                          }
                        >
                          {colorModeLabel(job.colorMode)}
                        </span>
                      </td>

                      {/* Paper size */}
                      <td className="px-4 py-3 text-center text-sm text-gray-600 whitespace-nowrap">
                        {job.paperSize}
                      </td>

                      {/* Discount */}
                      <td className="px-4 py-3 text-right text-sm whitespace-nowrap">
                        {pct > 0 ? (
                          <span className="text-orange-700 font-medium">
                            {pct}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Charge */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-semibold text-gray-900 tabular-nums">
                            {formatRupiah(job.netRupiah)}
                          </span>
                          {job.discountRupiah > 0 && (
                            <span className="text-xs text-gray-400 line-through tabular-nums">
                              <span className="sr-only">
                                harga sebelum diskon{" "}
                              </span>
                              {formatRupiah(job.grossRupiah)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Datetime */}
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatDateID(job.datetime)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <Badge tone={statusTone(job.status)}>
                          {statusLabel(job.status)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
