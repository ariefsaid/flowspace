/**
 * Admin email settings — per-event notification toggles + sender name
 * (I-042, spec 0009). RSC: loads the org's "email" org_settings blob,
 * defaults every toggle to false / sender name to "" when no row exists yet
 * (empty state). ADMIN-only is enforced by middleware + the (admin) layout
 * guard.
 */
import { requireSession } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/db/org-settings";
import { EmailClient } from "./EmailClient";
import type { EmailSettingsInput } from "./actions";

export default async function AdminEmailSettingsPage() {
  const { orgId } = await requireSession();
  const raw = await getOrgSettings(orgId, "email");

  const initial: EmailSettingsInput = {
    senderName: typeof raw.senderName === "string" ? raw.senderName : "",
    registrationEnabled: raw.registrationEnabled === true,
    bookingEnabled: raw.bookingEnabled === true,
    paymentEnabled: raw.paymentEnabled === true,
  };

  return <EmailClient initial={initial} />;
}
