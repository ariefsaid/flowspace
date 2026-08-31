/**
 * Admin analytics settings — GA4 measurement ID + enable toggle (I-042, spec
 * 0009). RSC: loads the org's "analytics" org_settings blob, defaults to
 * disabled/blank when no row exists yet (empty state). ADMIN-only is
 * enforced by middleware + the (admin) layout guard.
 */
import { requireSession } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/db/org-settings";
import { AnalyticsClient } from "./AnalyticsClient";
import type { AnalyticsSettingsInput } from "./actions";

export default async function AdminAnalyticsSettingsPage() {
  const { orgId } = await requireSession();
  const raw = await getOrgSettings(orgId, "analytics");

  const initial: AnalyticsSettingsInput = {
    measurementId: typeof raw.measurementId === "string" ? raw.measurementId : "",
    enabled: raw.enabled === true,
  };

  return <AnalyticsClient initial={initial} />;
}
