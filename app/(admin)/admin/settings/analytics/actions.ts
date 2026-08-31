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

/** Rejects a non-empty measurement ID that doesn't match the GA4 format. */
function assertValid(input: AnalyticsSettingsInput): void {
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
  await setOrgSettings(user.orgId, "analytics", input);
  revalidatePath("/admin/settings/analytics");
}
