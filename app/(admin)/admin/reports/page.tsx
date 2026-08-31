/**
 * Admin "Laporan" — server component (I-048, /admin/reports).
 * Reads the org-scoped analytics aggregates for the default period ("weekly",
 * matching the ORIG default) and hands them to the client leaf, which
 * re-queries via a server action when the admin changes the period selector.
 * ADMIN-only is enforced server-side by middleware.ts + the (admin) layout
 * (not re-checked here; re-checked in actions.ts for the client re-query).
 */
import { requireSession } from "@/lib/auth/session";
import { getReportsData } from "@/lib/db/reports";
import { ReportsClient } from "./ReportsClient";

const DEFAULT_PERIOD = "weekly" as const;

export default async function AdminReportsPage() {
  const { orgId } = await requireSession();
  const data = await getReportsData(orgId, DEFAULT_PERIOD);
  return <ReportsClient initialData={data} initialPeriod={DEFAULT_PERIOD} />;
}
