/**
 * Repository: membership_tier_config (I-027/I-041, spec 0006/0008). [SEC] money path.
 *
 * Per-org, per-tier discount rates (coworking/meeting/cafe/print) that the
 * pricing paths read instead of the lib pricing constants. Every fn takes a
 * server-derived `orgId` (never client-supplied). Writes validate percentages
 * server-side and are scoped to (orgId, tier) — the unique index makes the
 * upsert idempotent.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { membershipTierConfig, type MembershipTierConfig } from "@/lib/db/schema";
import { MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/db/enums";
import type { TierDiscounts } from "@/lib/tier-discounts";

/**
 * The four discount dimensions, keyed by their `TierDiscounts` field name and
 * mapped to the short label used in `INVALID_PCT:<dimension>` errors.
 * `satisfies Record<keyof TierDiscounts, string>` makes this compiler-enforced:
 * adding/removing a `TierDiscounts` field forces this map (and both loops
 * below that iterate it) to be updated too — validation and the insert/update
 * field allow-list can never silently drift apart.
 */
const PCT_DIMS = {
  coworkingDiscountPct: "coworking",
  meetingDiscountPct: "meeting",
  cafeDiscountPct: "cafe",
  printDiscountPct: "print",
} satisfies Record<keyof TierDiscounts, string>;

/**
 * Picks exactly the four known discount fields off `rates` — an explicit
 * allow-list, not a spread, so an extra/unexpected property on the input
 * object (however it got there) can never reach the insert/update statement.
 */
function pickPctFields(rates: TierDiscounts): TierDiscounts {
  const picked = {} as TierDiscounts;
  for (const field of Object.keys(PCT_DIMS) as (keyof TierDiscounts)[]) {
    picked[field] = rates[field];
  }
  return picked;
}

/** All tier-config rows for the org, ordered by tier (admin editor + listing). */
export function listTierConfig(orgId: string): Promise<MembershipTierConfig[]> {
  return db
    .select()
    .from(membershipTierConfig)
    .where(eq(membershipTierConfig.orgId, orgId))
    .orderBy(asc(membershipTierConfig.tier));
}

/** All four discount % for one (org, tier); fail-closed to four zeroes on a missing row (NFR-500). */
export async function getTierDiscounts(
  orgId: string,
  tier: MembershipTier,
): Promise<TierDiscounts> {
  const [row] = await db
    .select({
      coworkingDiscountPct: membershipTierConfig.coworkingDiscountPct,
      meetingDiscountPct: membershipTierConfig.meetingDiscountPct,
      cafeDiscountPct: membershipTierConfig.cafeDiscountPct,
      printDiscountPct: membershipTierConfig.printDiscountPct,
    })
    .from(membershipTierConfig)
    .where(
      and(eq(membershipTierConfig.orgId, orgId), eq(membershipTierConfig.tier, tier)),
    )
    .limit(1);
  return (
    row ?? { coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 }
  );
}

function assertPct(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`INVALID_PCT:${label}`);
  }
}

/**
 * Set a tier's discount rates for the org (ADMIN-only — caller enforces role).
 * Validates the tier is a known enum value and each percentage is an integer
 * 0–100 (rejects otherwise, no write), then upserts all four dims atomically.
 */
export async function updateTierDiscounts(
  orgId: string,
  tier: MembershipTier,
  rates: TierDiscounts,
  txdb: Pick<typeof db, "insert"> = db,
): Promise<void> {
  if (!MEMBERSHIP_TIERS.includes(tier)) throw new Error("INVALID_TIER");
  for (const [field, label] of Object.entries(PCT_DIMS) as [keyof TierDiscounts, string][]) {
    assertPct(rates[field], label);
  }
  const pct = pickPctFields(rates);
  await txdb
    .insert(membershipTierConfig)
    .values({ orgId, tier, ...pct })
    .onConflictDoUpdate({
      target: [membershipTierConfig.orgId, membershipTierConfig.tier],
      set: { ...pct, updatedAt: new Date() },
    });
}
