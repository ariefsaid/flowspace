"use server";
/**
 * Admin analytics-settings action (I-042, spec 0009). ADMIN-only. Persists a
 * GA4 measurement ID + enable toggle to org_settings under category
 * "analytics". Injection into the page is NOT wired (matches the reverse-
 * engineered original, which also never injected it — this only stores the
 * config for a future wiring).
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { setOrgSettings } from "@/lib/db/org-settings";

export type AnalyticsSettingsInput = {
  measurementId: string;
  enabled: boolean;
};

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;
// GA4 measurement IDs are ~12 chars ("G-XXXXXXXXXX"); the format regex alone
// has no upper bound, so cap the length first [SEC].
const MEASUREMENT_ID_MAX_LEN = 50;

/** Rejects an oversized or malformed (non-empty) measurement ID. */
function assertValid(input: AnalyticsSettingsInput): void {
  if (input.measurementId.length > MEASUREMENT_ID_MAX_LEN) {
    throw new Error("INVALID_LENGTH:measurementId");
  }
  if (input.measurementId !== "" && !MEASUREMENT_ID_PATTERN.test(input.measurementId)) {
    throw new Error("INVALID_MEASUREMENT_ID");
  }
}

export async function saveAnalyticsSettingsAction(input: AnalyticsSettingsInput) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  assertValid(input);
  // [SEC] allowlisted object — never spread `input` through; a raw JSON
  // body can carry an extra/huge key regardless of the TS type.
  const values: AnalyticsSettingsInput = {
    measurementId: input.measurementId,
    enabled: input.enabled,
  };
  await setOrgSettings(user.orgId, "analytics", values);
  revalidatePath("/admin/settings/analytics");
}
