"use server";
/**
 * Admin pricing-config actions (I-027/I-041, spec 0006/0008). [SEC] money path.
 *
 * savePricingConfigAction: ADMIN-only. Persists per-tier four-dimensional
 * discount % (coworking/meeting/cafe/print) + per-org print base rates.
 * orgId comes from the session; the repos validate ranges (0–100 pct /
 * positive Rupiah) and reject invalid input with no write. FR-524 / AC-510,
 * AC-521, AC-524, AC-526.
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { updateTierDiscounts } from "@/lib/db/tier-config";
import { updatePrintPricing } from "@/lib/db/print-pricing";
import type { MembershipTier } from "@/lib/db/enums";
import type { TierDiscounts } from "@/lib/tier-discounts";

export type SavePricingConfigInput = {
  printPricing: { bwRatePerPageRupiah: number; colorRatePerPageRupiah: number };
  tiers: Array<TierDiscounts & { tier: MembershipTier }>;
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
      const { tier, ...rates } = t;
      await updateTierDiscounts(user.orgId, tier, rates, tx);
    }
  });

  revalidatePath("/admin/settings/tiers");
}
