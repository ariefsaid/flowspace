import type { MembershipTierConfig } from "@/lib/db/schema";
import { MEMBERSHIP_TIERS } from "@/lib/db/enums";
import type { TierRow } from "./TiersClient";

/**
 * Projects the org's tier-config rows to one `TierRow` per known enum tier,
 * filling four zeroes for a tier with no config row (fail-safe — a missing
 * row never grants an unintended discount, mirrors `getTierDiscounts`).
 */
export function toTierRows(config: MembershipTierConfig[]): TierRow[] {
  const byTier = new Map(config.map((c) => [c.tier, c]));
  return MEMBERSHIP_TIERS.map((tier) => {
    const row = byTier.get(tier);
    return {
      tier,
      coworkingDiscountPct: row?.coworkingDiscountPct ?? 0,
      meetingDiscountPct: row?.meetingDiscountPct ?? 0,
      cafeDiscountPct: row?.cafeDiscountPct ?? 0,
      printDiscountPct: row?.printDiscountPct ?? 0,
    };
  });
}
