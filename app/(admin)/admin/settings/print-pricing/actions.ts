"use server";
/**
 * Admin print-pricing matrix action (I-042, spec 0009). [SEC] money path.
 *
 * upsertPrintPricingCellAction: ADMIN-only. Persists one (colorMode,
 * paperSize) cell of the org's print-price matrix; orgId comes from the
 * session, never the client. The repo validates paper size + positive
 * integer Rupiah before any write and rejects invalid input with no write.
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { upsertPrintPricingCell } from "@/lib/db/print-pricing";
import type { PrintColorMode } from "@/lib/db/enums";

export type UpsertPrintPricingCellInput = {
  colorMode: PrintColorMode;
  paperSize: string;
  pricePerPageRupiah: number;
  isActive: boolean;
};

export async function upsertPrintPricingCellAction(
  input: UpsertPrintPricingCellInput,
): Promise<void> {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  await upsertPrintPricingCell(user.orgId, input);
  revalidatePath("/admin/settings/print-pricing");
}
