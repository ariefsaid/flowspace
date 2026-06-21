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
import { PrintReportsClient } from "./PrintReportsClient";
import { toView, buildSummary } from "./derive";

export default async function AdminPrintReportsPage() {
  const { orgId } = await requireSession();

  const rows = await listPrintJobsForAdmin(orgId);

  // Attach member names in one org-scoped read (cross-org ids never match).
  const memberIds = [...new Set(rows.map((r) => r.userId))];
  const profiles = await findProfilesByIds(orgId, memberIds);
  const nameById = new Map(profiles.map((p) => [p.id, p.name]));

  const jobs = rows.map((r) => toView(r, nameById.get(r.userId) ?? "—"));
  const summary = buildSummary(rows);

  return <PrintReportsClient jobs={jobs} summary={summary} />;
}
