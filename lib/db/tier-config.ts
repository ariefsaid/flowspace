/**
 * Repository: membership_tier_config (I-027, spec 0006). [SEC] money path.
 *
 * Per-org, per-tier discount rates (cafe + print) that the pricing paths read
 * instead of the lib pricing constants. Every fn takes a server-derived
 * `orgId` (never client-supplied). Writes validate percentages server-side and
 * are scoped to (orgId, tier) — the unique index makes the upsert idempotent.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { membershipTierConfig, type MembershipTierConfig } from "@/lib/db/schema";
import type { MembershipTier } from "@/lib/db/enums";

/** All tier-config rows for the org, ordered by tier (admin editor + listing). */
export function listTierConfig(orgId: string): Promise<MembershipTierConfig[]> {
  return db
    .select()
    .from(membershipTierConfig)
    .where(eq(membershipTierConfig.orgId, orgId))
    .orderBy(asc(membershipTierConfig.tier));
}

/**
 * The discount rates for one tier, org-scoped. Falls back to 0/0 when no row
 * exists (fail-safe: a missing config never grants an unintended discount).
 */
export async function getTierDiscounts(
  orgId: string,
  tier: MembershipTier,
): Promise<{ cafeDiscountPct: number; printDiscountPct: number }> {
  const [row] = await db
    .select({
      cafeDiscountPct: membershipTierConfig.cafeDiscountPct,
      printDiscountPct: membershipTierConfig.printDiscountPct,
    })
    .from(membershipTierConfig)
    .where(
      and(eq(membershipTierConfig.orgId, orgId), eq(membershipTierConfig.tier, tier)),
    )
    .limit(1);
  return row ?? { cafeDiscountPct: 0, printDiscountPct: 0 };
}

function assertPct(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`INVALID_PCT:${label}`);
  }
}

/**
 * Set a tier's discount rates for the org (ADMIN-only — caller enforces role).
 * Validates each percentage is an integer 0–100 (rejects otherwise, no write),
 * then upserts the (orgId, tier) row.
 */
export async function updateTierDiscounts(
  orgId: string,
  tier: MembershipTier,
  rates: { cafeDiscountPct: number; printDiscountPct: number },
  txdb: Pick<typeof db, "insert"> = db,
): Promise<void> {
  assertPct(rates.cafeDiscountPct, "cafe");
  assertPct(rates.printDiscountPct, "print");
  await txdb
    .insert(membershipTierConfig)
    .values({
      orgId,
      tier,
      cafeDiscountPct: rates.cafeDiscountPct,
      printDiscountPct: rates.printDiscountPct,
    })
    .onConflictDoUpdate({
      target: [membershipTierConfig.orgId, membershipTierConfig.tier],
      set: {
        cafeDiscountPct: rates.cafeDiscountPct,
        printDiscountPct: rates.printDiscountPct,
        updatedAt: new Date(),
      },
    });
}
