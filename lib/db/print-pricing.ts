/**
 * Repository: org_print_pricing (I-027, spec 0006). [SEC] money path.
 *
 * Per-org BW/COLOR per-page base rates that the print pricing path reads instead
 * of the PRINT_RATE_* constants. Server-derived `orgId` only. Falls back to the
 * constant defaults when no row exists (fail-safe). Admin writes validate the
 * rates are positive integers and upsert the single per-org row.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { orgPrintPricing } from "@/lib/db/schema";
import { PRINT_RATE_BW, PRINT_RATE_COLOR } from "@/lib/print/pricing";

export type PrintPricing = {
  bwRatePerPageRupiah: number;
  colorRatePerPageRupiah: number;
};

/** The org's print base rates, or the constant defaults when unconfigured. */
export async function getPrintPricing(orgId: string): Promise<PrintPricing> {
  const [row] = await db
    .select({
      bwRatePerPageRupiah: orgPrintPricing.bwRatePerPageRupiah,
      colorRatePerPageRupiah: orgPrintPricing.colorRatePerPageRupiah,
    })
    .from(orgPrintPricing)
    .where(eq(orgPrintPricing.orgId, orgId))
    .limit(1);
  return (
    row ?? {
      bwRatePerPageRupiah: PRINT_RATE_BW,
      colorRatePerPageRupiah: PRINT_RATE_COLOR,
    }
  );
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`INVALID_RATE:${label}`);
  }
}

/**
 * Set the org's print base rates (ADMIN-only — caller enforces role). Validates
 * each is a positive integer (rejects otherwise, no write), then upserts.
 */
export async function updatePrintPricing(
  orgId: string,
  rates: { bwRatePerPageRupiah: number; colorRatePerPageRupiah: number },
): Promise<void> {
  assertPositiveInt(rates.bwRatePerPageRupiah, "bw");
  assertPositiveInt(rates.colorRatePerPageRupiah, "color");
  await db
    .insert(orgPrintPricing)
    .values({
      orgId,
      bwRatePerPageRupiah: rates.bwRatePerPageRupiah,
      colorRatePerPageRupiah: rates.colorRatePerPageRupiah,
    })
    .onConflictDoUpdate({
      target: orgPrintPricing.orgId,
      set: {
        bwRatePerPageRupiah: rates.bwRatePerPageRupiah,
        colorRatePerPageRupiah: rates.colorRatePerPageRupiah,
        updatedAt: new Date(),
      },
    });
}
