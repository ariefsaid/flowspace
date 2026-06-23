"use server";
/**
 * Admin pricing-config actions (I-027, spec 0006). [SEC] money path.
 *
 * savePricingConfigAction: ADMIN-only. Persists per-tier discount % + per-org
 * print base rates. orgId comes from the session; the repos validate ranges
 * (0–100 pct / positive Rupiah) and reject invalid input with no write. FR-404,
 * FR-405, FR-406 / AC-403, AC-404, AC-407.
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { updateTierDiscounts } from "@/lib/db/tier-config";
import { updatePrintPricing } from "@/lib/db/print-pricing";
import type { MembershipTier } from "@/lib/db/enums";

export type SavePricingConfigInput = {
  printPricing: { bwRatePerPageRupiah: number; colorRatePerPageRupiah: number };
  tiers: Array<{
    tier: MembershipTier;
    cafeDiscountPct: number;
    printDiscountPct: number;
  }>;
};

export async function savePricingConfigAction(input: SavePricingConfigInput) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  // All-or-nothing: validate + persist print rates and every tier in ONE
  // transaction so a mid-loop rejection never leaves a half-applied money
  // config. The repos validate (range / positive-int) before any write.
  await db.transaction(async (tx) => {
    await updatePrintPricing(user.orgId, input.printPricing, tx);
    for (const t of input.tiers) {
      await updateTierDiscounts(
        user.orgId,
        t.tier,
        { cafeDiscountPct: t.cafeDiscountPct, printDiscountPct: t.printDiscountPct },
        tx,
      );
    }
  });

  revalidatePath("/admin/settings/tiers");
}
