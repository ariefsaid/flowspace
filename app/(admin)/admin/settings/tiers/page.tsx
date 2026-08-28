/**
 * Admin pricing config — "Kategori Membership & Harga Print" (I-027/I-041,
 * spec 0006/0008). RSC: loads the org's four-dimensional per-tier discount
 * rows + print base rates, renders the editor. ADMIN-only is enforced by
 * middleware + the (admin) layout guard. (FR-528, AC-520)
 */
import { requireSession } from "@/lib/auth/session";
import { listTierConfig } from "@/lib/db/tier-config";
import { getPrintPricing } from "@/lib/db/print-pricing";
import { TiersClient } from "./TiersClient";
import { toTierRows } from "./toTierRows";

export default async function AdminPricingConfigPage() {
  const { orgId } = await requireSession();

  const [config, pricing] = await Promise.all([
    listTierConfig(orgId),
    getPrintPricing(orgId),
  ]);

  return <TiersClient tiers={toTierRows(config)} printPricing={pricing} />;
}
