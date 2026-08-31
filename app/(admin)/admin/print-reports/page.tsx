/**
 * Admin "Laporan Print" — server component (I-026, spec 0005).
 * Reads all org-scoped print jobs (newest-first) and attaches each job's member
 * name in one org-scoped read (the admin bookings pattern). Read-only billing
 * report. ADMIN-only is enforced server-side by middleware.ts (not re-checked
 * here). Summary aggregates are computed server-side; revenue = Σ net charge of
 * COMPLETED jobs. (FR-300..FR-303)
 */
import { requireSession } from "@/lib/auth/session";
import { listPrintJobsForAdmin, getPrintReportSummary } from "@/lib/db/print";
import { listPrintersForAdmin } from "@/lib/db/printers";
import { findProfilesByIds } from "@/lib/db/users";
import { PrintReportsClient } from "./PrintReportsClient";
import { toView, parseFilterParams, toDbFilters } from "./derive";

export default async function AdminPrintReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await requireSession();

  // I-047: the filter bar drives a server-side re-query via URL
  // searchParams — never a client-side refetch.
  const filterState = parseFilterParams(await searchParams);

  // Summary aggregates come from SQL over ALL jobs (uncapped, unfiltered); the
  // table lists the newest rows matching the active filters, up to
  // listPrintJobsForAdmin's cap.
  const [rows, summary, printerRows] = await Promise.all([
    listPrintJobsForAdmin(orgId, toDbFilters(filterState)),
    getPrintReportSummary(orgId),
    listPrintersForAdmin(orgId),
  ]);

  // Attach member names in one org-scoped read (cross-org ids never match).
  const memberIds = [...new Set(rows.map((r) => r.userId))];
  const profiles = await findProfilesByIds(orgId, memberIds);
  const nameById = new Map(profiles.map((p) => [p.id, p.name]));

  const printerById = new Map(printerRows.map((printer) => [printer.id, printer]));
  const jobs = rows.map((r) => toView(r, nameById.get(r.userId) ?? "—", r.printerId ? printerById.get(r.printerId) ?? null : null));

  return <PrintReportsClient jobs={jobs} summary={summary} filters={filterState} />;
}
