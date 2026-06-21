/**
 * Pure server-side derivation for the admin print report (spec 0005).
 * Extracted from the RSC so the row→view mapping and the summary aggregates are
 * directly unit-testable (AC-301, AC-302). No DB access, no client code.
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

/**
 * Server-side summary aggregates over the org's print jobs. Counts distinct
 * users by `userId` (not display name), and revenue = Σ net (totalRupiah) over
 * COMPLETED jobs. (FR-302)
 */
export function buildSummary(rows: PrintJob[]): PrintReportsSummary {
  const completed = rows.filter((r) => r.status === "COMPLETED");
  return {
    totalJobs: rows.length,
    totalPages: rows.reduce((s, r) => s + r.pages, 0),
    uniqueUsers: new Set(rows.map((r) => r.userId)).size,
    totalRevenue: completed.reduce((s, r) => s + r.totalRupiah, 0),
    completedCount: completed.length,
  };
}
