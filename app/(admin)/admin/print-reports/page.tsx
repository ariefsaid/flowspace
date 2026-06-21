/**
 * Admin "Laporan Print" — server component (I-026, spec 0005).
 * Reads all org-scoped print jobs (newest-first) and attaches each job's member
 * name in one org-scoped read (the admin bookings pattern). Read-only billing
 * report. ADMIN-only is enforced server-side by middleware.ts (not re-checked
 * here). Summary aggregates are computed server-side; revenue = Σ net charge of
 * COMPLETED jobs. (FR-300..FR-303)
 */
import { requireSession } from "@/lib/auth/session";
import { listPrintJobsForAdmin } from "@/lib/db/print";
import { findProfilesByIds } from "@/lib/db/users";
import {
  PrintReportsClient,
  type AdminPrintJobView,
  type PrintReportsSummary,
} from "./PrintReportsClient";

export default async function AdminPrintReportsPage() {
  const { orgId } = await requireSession();

  const rows = await listPrintJobsForAdmin(orgId);

  // Attach member names in one org-scoped read (cross-org ids never match).
  const memberIds = [...new Set(rows.map((r) => r.userId))];
  const profiles = await findProfilesByIds(orgId, memberIds);
  const nameById = new Map(profiles.map((p) => [p.id, p.name]));

  const jobs: AdminPrintJobView[] = rows.map((r) => ({
    id: r.id,
    user: nameById.get(r.userId) ?? "—",
    fileName: r.fileName,
    pages: r.pages,
    colorMode: r.colorMode,
    paperSize: r.paperSize,
    discountRupiah: r.discountRupiah,
    grossRupiah: r.totalRupiah + r.discountRupiah,
    netRupiah: r.totalRupiah,
    datetime: r.createdAt.toISOString(),
    status: r.status,
  }));

  const completed = jobs.filter((j) => j.status === "COMPLETED");
  const summary: PrintReportsSummary = {
    totalJobs: jobs.length,
    totalPages: jobs.reduce((s, j) => s + j.pages, 0),
    uniqueUsers: new Set(jobs.map((j) => j.user)).size,
    totalRevenue: completed.reduce((s, j) => s + j.netRupiah, 0),
    completedCount: completed.length,
  };

  return <PrintReportsClient jobs={jobs} summary={summary} />;
}
