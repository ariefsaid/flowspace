/**
 * Admin site settings — venue info / SEO / social links (I-042, spec 0009).
 * RSC: loads the org's "site" org_settings blob, defaults every field to ""
 * when no row exists yet (empty state), renders the editor. ADMIN-only is
 * enforced by middleware + the (admin) layout guard.
 */
import { requireSession } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/db/org-settings";
import { SiteClient } from "./SiteClient";
import type { SiteSettingsInput } from "./actions";

export default async function AdminSiteSettingsPage() {
  const { orgId } = await requireSession();
  const raw = await getOrgSettings(orgId, "site");

  const initial: SiteSettingsInput = {
    name: typeof raw.name === "string" ? raw.name : "",
    tagline: typeof raw.tagline === "string" ? raw.tagline : "",
    address: typeof raw.address === "string" ? raw.address : "",
    phone: typeof raw.phone === "string" ? raw.phone : "",
    openingHours: typeof raw.openingHours === "string" ? raw.openingHours : "",
    seoTitle: typeof raw.seoTitle === "string" ? raw.seoTitle : "",
    seoDescription: typeof raw.seoDescription === "string" ? raw.seoDescription : "",
    socialInstagram: typeof raw.socialInstagram === "string" ? raw.socialInstagram : "",
    socialFacebook: typeof raw.socialFacebook === "string" ? raw.socialFacebook : "",
    socialWhatsapp: typeof raw.socialWhatsapp === "string" ? raw.socialWhatsapp : "",
  };

  return <SiteClient initial={initial} />;
}
