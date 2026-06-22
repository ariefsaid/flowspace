/**
 * Pure server-side row→view mapping for the admin print report (spec 0005).
 * Extracted from the RSC so the mapping is directly unit-testable (AC-302). No
 * DB access, no client code. (Summary aggregates are computed in SQL by
 * getPrintReportSummary — AC-301 — so they stay independent of the table cap.)
 */
import type { PrintJob } from "@/lib/db/schema";
import type { PrintColorMode, PrintJobStatus } from "@/lib/db/enums";

// ---------------------------------------------------------------------------
// View model — one per print job, billing-detail shape (OBS-035). Monetary
// fields are server-computed integers from the persisted job; the discount %
// is derived for presentation only (NFR-300). userId is intentionally NOT
// exposed to the client view.
// ---------------------------------------------------------------------------

export interface AdminPrintJobView {
  id: string;
  user: string;
  fileName: string;
  pages: number;
  colorMode: PrintColorMode;
  paperSize: string;
  /** Absolute discount in Rupiah (0 = none). */
  discountRupiah: number;
  /** Gross charge before discount (net + discount). */
  grossRupiah: number;
  /** Net charge after discount (the persisted total). */
  netRupiah: number;
  /** ISO timestamp. */
  datetime: string;
  status: PrintJobStatus;
}

export interface PrintReportsSummary {
  totalJobs: number;
  totalPages: number;
  uniqueUsers: number;
  /** Σ net charge over COMPLETED jobs. */
  totalRevenue: number;
  completedCount: number;
}

/** Maps a persisted print job + its resolved member name to the view row. */
export function toView(row: PrintJob, userName: string): AdminPrintJobView {
  return {
    id: row.id,
    user: userName,
    fileName: row.fileName,
    pages: row.pages,
    colorMode: row.colorMode,
    paperSize: row.paperSize,
    discountRupiah: row.discountRupiah,
    grossRupiah: row.totalRupiah + row.discountRupiah,
    netRupiah: row.totalRupiah,
    datetime: row.createdAt.toISOString(),
    status: row.status,
  };
}
