"use client";

import {
  Printer,
  FileText,
  Banknote,
  Users,
  TrendingUp,
  Inbox,
} from "lucide-react";
import { StatTile } from "@/components/ui";
import { Badge } from "@/components/ui";
import { Card } from "@/components/ui";
import { formatRupiah, formatDateID } from "@/lib/format";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Extended print job type for admin billing report (OBS-035)
// ---------------------------------------------------------------------------

type ColorMode = "B/W" | "Warna";
type PaperSize = "A4" | "F4" | "A3" | "Letter";
type PrintJobAdminStatus = "WAITING" | "READY" | "COMPLETED" | "CANCELLED";

interface AdminPrintJob {
  id: string;
  user: string;
  filename: string;
  pages: number;
  colorMode: ColorMode;
  paperSize: PaperSize;
  /** Discount percentage, 0–100. */
  discount: number;
  /** Gross charge before discount (Rupiah). */
  grossCharge: number;
  /** Net charge after discount (Rupiah). */
  netCharge: number;
  datetime: string;
  status: PrintJobAdminStatus;
}

// ---------------------------------------------------------------------------
// Mock data — per-user print jobs with billing detail (OBS-035)
// ---------------------------------------------------------------------------

const adminPrintJobs: AdminPrintJob[] = [
  {
    id: "pj_410",
    user: "Budi Santoso",
    filename: "kontrak-sewa.pdf",
    pages: 12,
    colorMode: "B/W",
    paperSize: "A4",
    discount: 0,
    grossCharge: 11520,
    netCharge: 11520,
    datetime: "2026-06-15T15:01:00+07:00",
    status: "WAITING",
  },
  {
    id: "pj_409",
    user: "Maya Lestari",
    filename: "akta-notaris-final.pdf",
    pages: 30,
    colorMode: "Warna",
    paperSize: "A4",
    discount: 25,
    grossCharge: 90000,
    netCharge: 67500,
    datetime: "2026-06-15T14:22:00+07:00",
    status: "COMPLETED",
  },
  {
    id: "pj_408",
    user: "Sari Wijaya",
    filename: "laporan-audit-Q1.pdf",
    pages: 45,
    colorMode: "B/W",
    paperSize: "F4",
    discount: 10,
    grossCharge: 45000,
    netCharge: 40500,
    datetime: "2026-06-15T13:10:00+07:00",
    status: "READY",
  },
  {
    id: "pj_407",
    user: "Andi Pratama",
    filename: "gugatan-perdata.docx",
    pages: 8,
    colorMode: "B/W",
    paperSize: "A4",
    discount: 0,
    grossCharge: 4000,
    netCharge: 4000,
    datetime: "2026-06-14T11:30:00+07:00",
    status: "COMPLETED",
  },
  {
    id: "pj_406",
    user: "Rizki Hidayat",
    filename: "presentasi-klien.pptx",
    pages: 24,
    colorMode: "Warna",
    paperSize: "A4",
    discount: 10,
    grossCharge: 72000,
    netCharge: 64800,
    datetime: "2026-06-14T09:50:00+07:00",
    status: "COMPLETED",
  },
  {
    id: "pj_405",
    user: "Budi Santoso",
    filename: "surat-kuasa-khusus.docx",
    pages: 3,
    colorMode: "B/W",
    paperSize: "A4",
    discount: 0,
    grossCharge: 1500,
    netCharge: 1500,
    datetime: "2026-06-14T08:45:00+07:00",
    status: "CANCELLED",
  },
  {
    id: "pj_404",
    user: "Maya Lestari",
    filename: "riset-hukum-pidana.pdf",
    pages: 60,
    colorMode: "B/W",
    paperSize: "F4",
    discount: 25,
    grossCharge: 60000,
    netCharge: 45000,
    datetime: "2026-06-13T16:20:00+07:00",
    status: "COMPLETED",
  },
  {
    id: "pj_403",
    user: "Sari Wijaya",
    filename: "proposal-retainer.pdf",
    pages: 18,
    colorMode: "Warna",
    paperSize: "A4",
    discount: 10,
    grossCharge: 54000,
    netCharge: 48600,
    datetime: "2026-06-13T11:05:00+07:00",
    status: "COMPLETED",
  },
];

// ---------------------------------------------------------------------------
// Derived summary stats
// ---------------------------------------------------------------------------

const totalJobs = adminPrintJobs.length;
const totalPages = adminPrintJobs.reduce((s, j) => s + j.pages, 0);
const totalRevenue = adminPrintJobs
  .filter((j) => j.status === "COMPLETED")
  .reduce((s, j) => s + j.netCharge, 0);
const uniqueUsers = new Set(adminPrintJobs.map((j) => j.user)).size;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusTone(
  status: PrintJobAdminStatus
): "pending" | "active" | "completed" | "cancelled" {
  switch (status) {
    case "WAITING":
      return "pending";
    case "READY":
      return "active";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
  }
}

function statusLabel(status: PrintJobAdminStatus): string {
  switch (status) {
    case "WAITING":
      return "Menunggu";
    case "READY":
      return "Siap Ambil";
    case "COMPLETED":
      return "Selesai";
    case "CANCELLED":
      return "Dibatalkan";
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPrintReportsPage() {
  const isEmpty = adminPrintJobs.length === 0;

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
          value={totalJobs}
          unit="job"
          icon={Printer}
          accent="purple"
        />
        <StatTile
          label="Total Halaman"
          value={totalPages}
          unit="hlm"
          icon={FileText}
          accent="blue"
        />
        <StatTile
          label="Pengguna Aktif"
          value={uniqueUsers}
          unit="pengguna"
          icon={Users}
          accent="teal"
        />
        <StatTile
          label="Pendapatan Print"
          value={formatRupiah(totalRevenue)}
          icon={Banknote}
          accent="green"
        />
      </div>

      {/* Revenue highlight card */}
      <div className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-4 shadow-md text-white">
        <div className="min-w-0">
          <p className="text-sm font-medium text-purple-100">
            Total Pendapatan Print (Selesai)
          </p>
          <p className="mt-1 truncate text-2xl font-bold">
            {formatRupiah(totalRevenue)}
          </p>
          <p className="mt-0.5 text-xs text-purple-200">
            dari {adminPrintJobs.filter((j) => j.status === "COMPLETED").length}{" "}
            job selesai
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
          <Printer className="h-5 w-5 text-purple-500" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-gray-800">
            Daftar Pekerjaan Print
          </h2>
          <span className="ml-auto text-xs text-gray-400">
            {totalJobs} job
          </span>
        </div>

        {/* Empty state */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-50">
              <Inbox className="h-7 w-7 text-purple-400" aria-hidden="true" />
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
                {adminPrintJobs.map((job) => (
                  <tr
                    key={job.id}
                    className={cn(
                      "transition-colors hover:bg-slate-50/60",
                      job.status === "CANCELLED" && "opacity-60"
                    )}
                  >
                    {/* User */}
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {job.user}
                    </td>

                    {/* Filename */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <span
                        className="block truncate text-sm text-gray-700"
                        title={job.filename}
                      >
                        {job.filename}
                      </span>
                    </td>

                    {/* Pages */}
                    <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums whitespace-nowrap">
                      {job.pages} hlm
                    </td>

                    {/* Color mode */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          job.colorMode === "Warna"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {job.colorMode}
                      </span>
                    </td>

                    {/* Paper size */}
                    <td className="px-4 py-3 text-center text-sm text-gray-600 whitespace-nowrap">
                      {job.paperSize}
                    </td>

                    {/* Discount */}
                    <td className="px-4 py-3 text-right text-sm whitespace-nowrap">
                      {job.discount > 0 ? (
                        <span className="text-orange-600 font-medium">
                          {job.discount}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Charge */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-sm font-semibold text-gray-900 tabular-nums">
                          {formatRupiah(job.netCharge)}
                        </span>
                        {job.discount > 0 && (
                          <span className="text-xs text-gray-400 line-through tabular-nums">
                            {formatRupiah(job.grossCharge)}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
