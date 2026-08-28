import type { MembershipTier } from "@/lib/db/enums";

/** One tier's four discount percentages (integer points, 0–100). */
export type TierDiscounts = {
  coworkingDiscountPct: number;
  meetingDiscountPct: number;
  cafeDiscountPct: number;
  printDiscountPct: number;
};

/**
 * Locked four-dimensional tier map (I-041, spec 0008; supersedes spec-0006's flat
 * 5% cafe + 0/20/20 print guesses). Single source of truth for the migration, dev
 * seed, and money paths so seed and fallback cannot drift (FR-529 / AC-527).
 * ORIG base/mid/top → REGULAR/PREMIUM/GOLD.
 */
export const LOCKED_TIER_DISCOUNTS: Record<MembershipTier, TierDiscounts> = {
  REGULAR: { coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 },
  PREMIUM: { coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 },
  GOLD: { coworkingDiscountPct: 15, meetingDiscountPct: 15, cafeDiscountPct: 10, printDiscountPct: 10 },
};
