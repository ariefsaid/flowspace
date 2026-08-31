import type { PrintJob } from "@/lib/db/schema";
import type { PrintColorMode, PrintJobStatus } from "@/lib/db/enums";
import type { PrintReportFilters } from "@/lib/db/print";

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
  /** I-047: PENDING + PROCESSING jobs still awaiting/undergoing work. */
  pendingCount: number;
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

// ---------------------------------------------------------------------------
// I-047: filter bar — URL searchParams <-> DB filters (server-side re-query;
// the client never re-queries on its own).
// ---------------------------------------------------------------------------

const VALID_STATUSES: readonly PrintJobStatus[] = ["PENDING", "PROCESSING", "READY", "COMPLETED", "FAILED"];

export interface PrintReportFilterState {
  search: string;
  status: PrintJobStatus | "ALL";
  /** yyyy-mm-dd, as produced by <input type="date">. */
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_FILTER_STATE: PrintReportFilterState = {
  search: "",
  status: "ALL",
  dateFrom: "",
  dateTo: "",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Parses Next's (possibly-array-valued) searchParams into filter state. Never
 * trusts the raw `status` param — an unknown value falls back to "ALL". */
export function parseFilterParams(sp: RawSearchParams): PrintReportFilterState {
  const rawStatus = firstValue(sp.status);
  const status =
    rawStatus && (VALID_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as PrintJobStatus)
      : "ALL";
  return {
    search: firstValue(sp.search)?.trim() ?? "",
    status,
    dateFrom: firstValue(sp.dateFrom) ?? "",
    dateTo: firstValue(sp.dateTo) ?? "",
  };
}

/** Converts filter state to `listPrintJobsForAdmin`'s DB filters — the
 * date-only strings become inclusive start/end-of-day bounds. */
export function toDbFilters(state: PrintReportFilterState): PrintReportFilters {
  const filters: PrintReportFilters = {};
  if (state.search) filters.search = state.search;
  if (state.status !== "ALL") filters.status = state.status;
  if (state.dateFrom) filters.dateFrom = new Date(`${state.dateFrom}T00:00:00`);
  if (state.dateTo) filters.dateTo = new Date(`${state.dateTo}T23:59:59.999`);
  return filters;
}

/** Serializes filter state to a URL query string (including the leading "?"),
 * or "" when every filter is unset. */
export function toQueryString(state: PrintReportFilterState): string {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.status !== "ALL") params.set("status", state.status);
  if (state.dateFrom) params.set("dateFrom", state.dateFrom);
  if (state.dateTo) params.set("dateTo", state.dateTo);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
