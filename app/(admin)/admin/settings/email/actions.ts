"use server";
/**
 * Admin email-settings action (I-042, spec 0009). ADMIN-only. Persists
 * per-event notification toggles + sender name to org_settings under
 * category "email". No real email service is wired here (that's I-045) —
 * the "Kirim Email Uji" affordance on the client simulates a send only.
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { setOrgSettings } from "@/lib/db/org-settings";

export type EmailSettingsInput = {
  senderName: string;
  registrationEnabled: boolean;
  bookingEnabled: boolean;
  paymentEnabled: boolean;
};

const MAX_LEN = 500;

export async function saveEmailSettingsAction(input: EmailSettingsInput) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  if (input.senderName.length > MAX_LEN) {
    throw new Error("INVALID_LENGTH:senderName");
  }

  // [SEC] allowlisted object — never spread `input` through; a raw JSON
  // body can carry an extra/huge key regardless of the TS type.
  const values: EmailSettingsInput = {
    senderName: input.senderName,
    registrationEnabled: input.registrationEnabled,
    bookingEnabled: input.bookingEnabled,
    paymentEnabled: input.paymentEnabled,
  };
  await setOrgSettings(user.orgId, "email", values);
  revalidatePath("/admin/settings/email");
}
