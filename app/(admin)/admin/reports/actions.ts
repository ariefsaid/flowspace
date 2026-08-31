"use server";
import { requireSession } from "@/lib/auth/session";
import { getReportsData, type ReportPeriod, type ReportsData } from "@/lib/db/reports";
import { REPORT_PERIODS } from "./derive";

/**
 * Client-driven period re-query for /admin/reports (I-048). ADMIN-only,
 * re-checked here (defense in depth — the (admin) layout + middleware already
 * gate the route, same pattern as print-reports' advancePrintJobAction).
 */
export async function getReportsAction(period: ReportPeriod): Promise<ReportsData> {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  if (!REPORT_PERIODS.includes(period)) throw new Error("INVALID_PERIOD");
  return getReportsData(user.orgId, period);
}
