import type { PrintJob } from "@/lib/db/schema";
import type { PrintColorMode, PrintJobStatus } from "@/lib/db/enums";

export interface AdminPrintJobView {
  id: string;
  user: string;
  fileName: string;
  pages: number;
  copies?: number;
  pageRange?: string;
  printer?: string | null;
  colorMode: PrintColorMode;
  paperSize: string;
  discountRupiah: number;
  grossRupiah: number;
  netRupiah: number;
  datetime: string;
  status: PrintJobStatus;
  processedBy?: string | null;
  processedAt?: string | null;
  completedAt?: string | null;
  canAdvance?: boolean;
}

export interface PrintReportsSummary {
  totalJobs: number;
  totalPages: number;
  uniqueUsers: number;
  totalRevenue: number;
  completedCount: number;
}

type PrinterView = { name: string; displayName: string };

export function toView(row: PrintJob, userName: string, printer?: PrinterView | null): AdminPrintJobView {
  return {
    id: row.id,
    user: userName,
    fileName: row.fileName,
    pages: row.totalPages ?? row.pages * row.copies,
    copies: row.copies,
    pageRange: row.pageRange ?? "all",
    printer: printer?.displayName ?? null,
    colorMode: row.colorMode,
    paperSize: row.paperSize,
    discountRupiah: row.discountRupiah,
    grossRupiah: row.totalRupiah + row.discountRupiah,
    netRupiah: row.totalRupiah,
    datetime: row.createdAt.toISOString(),
    status: row.status,
    processedBy: row.processedBy,
    processedAt: row.processedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    canAdvance: row.status !== "COMPLETED",
  };
}
