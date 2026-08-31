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
import { assertSafeHttpsUrl } from "../url-guard";

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

const SOCIAL_URL_FIELDS = ["socialInstagram", "socialFacebook", "socialWhatsapp"] as const;

/** Rejects any field over MAX_LEN, or a social link that isn't https:// on a
 * public host — no write on an invalid value. */
function assertValid(input: SiteSettingsInput): void {
  for (const field of FIELDS) {
    if (input[field].length > MAX_LEN) {
      throw new Error(`INVALID_LENGTH:${field}`);
    }
  }
  for (const field of SOCIAL_URL_FIELDS) {
    assertSafeHttpsUrl(input[field], field);
  }
}

export async function saveSiteSettingsAction(input: SiteSettingsInput) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  assertValid(input);
  // [SEC] allowlisted, per-field-capped object — never spread `input`
  // through; a raw JSON body can carry any extra/huge key regardless of the
  // TS type, which would otherwise bypass MAX_LEN and bloat the jsonb blob.
  const values: SiteSettingsInput = {
    name: input.name,
    tagline: input.tagline,
    address: input.address,
    phone: input.phone,
    openingHours: input.openingHours,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    socialInstagram: input.socialInstagram,
    socialFacebook: input.socialFacebook,
    socialWhatsapp: input.socialWhatsapp,
  };
  await setOrgSettings(user.orgId, "site", values);
  revalidatePath("/admin/settings/site");
}
