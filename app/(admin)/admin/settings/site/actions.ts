"use server";
/**
 * Admin site-settings action (I-042, spec 0009). ADMIN-only. Persists venue
 * info / SEO / social links to org_settings under category "site". This is
 * venue metadata only — the app's own brand/theme still comes from
 * brand.config.ts / env, never from here (see the note on the settings page).
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { setOrgSettings } from "@/lib/db/org-settings";

export type SiteSettingsInput = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  openingHours: string;
  seoTitle: string;
  seoDescription: string;
  socialInstagram: string;
  socialFacebook: string;
  socialWhatsapp: string;
};

const MAX_LEN = 500;
const FIELDS = [
  "name",
  "tagline",
  "address",
  "phone",
  "openingHours",
  "seoTitle",
  "seoDescription",
  "socialInstagram",
  "socialFacebook",
  "socialWhatsapp",
] as const;

/** Rejects any field over MAX_LEN — no write on an oversized value. */
function assertValid(input: SiteSettingsInput): void {
  for (const field of FIELDS) {
    if (input[field].length > MAX_LEN) {
      throw new Error(`INVALID_LENGTH:${field}`);
    }
  }
}

export async function saveSiteSettingsAction(input: SiteSettingsInput) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  assertValid(input);
  await setOrgSettings(user.orgId, "site", input);
  revalidatePath("/admin/settings/site");
}
