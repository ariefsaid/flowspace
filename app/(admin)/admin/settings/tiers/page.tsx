/**
 * Admin pricing config — "Kategori Membership & Harga Print" (I-027, spec 0006).
 * RSC: loads the org's per-tier discount rows + print base rates, renders the
 * editor. ADMIN-only is enforced by middleware + the (admin) layout guard.
 * (FR-401, AC-405)
 */
import { requireSession } from "@/lib/auth/session";
import { listTierConfig } from "@/lib/db/tier-config";
import { getPrintPricing } from "@/lib/db/print-pricing";
import { MEMBERSHIP_TIERS } from "@/lib/db/enums";
import { TiersClient, type TierRow } from "./TiersClient";

export default async function AdminPricingConfigPage() {
  const { orgId } = await requireSession();

  const [config, pricing] = await Promise.all([
    listTierConfig(orgId),
    getPrintPricing(orgId),
  ]);

  // Project to a row per known tier (fill 0/0 for any unconfigured tier).
  const byTier = new Map(config.map((c) => [c.tier, c]));
  const tiers: TierRow[] = MEMBERSHIP_TIERS.map((tier) => {
    const row = byTier.get(tier);
    return {
      tier,
      cafeDiscountPct: row?.cafeDiscountPct ?? 0,
      printDiscountPct: row?.printDiscountPct ?? 0,
    };
  });

  return <TiersClient tiers={tiers} printPricing={pricing} />;
}
