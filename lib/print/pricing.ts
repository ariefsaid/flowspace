/**
 * Server-side print-job pricing (I-023, [SEC] money path).
 * Pure function — no DB access. The repository calls this AFTER loading the
 * user's tier + the live rate; the client preview is never trusted.
 */
import type { MembershipTier, PrintColorMode } from "@/lib/db/enums";

/** Base BW rate: Rp 500/page (recon calculator). */
export const PRINT_RATE_BW = 500;
// ponytail: COLOR multiplier unknown from recon — assume 3× BW (Rp 1.500).
// Replace with a configurable rate when print pricing moves to /admin/settings.
export const PRINT_RATE_COLOR = 1500;

/**
 * Tier discount rate (ponytail: from recon "diskon 20%").
 * REGULAR 0%, PREMIUM 20%, GOLD 20%. GOLD uplift is deferred until the tier
 * matrix is finalized in /admin/settings — keep the shared 20% rate for now.
 */
const TIER_DISCOUNT_RATE: Record<MembershipTier, number> = {
  REGULAR: 0,
  PREMIUM: 0.2,
  GOLD: 0.2,
};

export interface PrintTotal {
  /** Per-page rate applied (BW or COLOR), in Rupiah. */
  pricePerPageRupiah: number;
  /** Absolute discount in Rupiah (rounded). */
  discountRupiah: number;
  /** Chargeable total in Rupiah (subtotal − discount). */
  totalRupiah: number;
}

/**
 * Computes the per-page rate, tier discount, and chargeable total for a print
 * job. `pages` is the document page count; `copies` is the multiplier — the
 * sheet cost is pages × copies at the per-page rate.
 */
export function computePrintTotal(input: {
  pages: number;
  copies: number;
  colorMode: PrintColorMode;
  tier: MembershipTier;
}): PrintTotal {
  const pricePerPageRupiah =
    input.colorMode === "BW" ? PRINT_RATE_BW : PRINT_RATE_COLOR;
  const subtotal = pricePerPageRupiah * input.pages * input.copies;
  const discountRupiah = Math.round(subtotal * TIER_DISCOUNT_RATE[input.tier]);
  return {
    pricePerPageRupiah,
    discountRupiah,
    totalRupiah: subtotal - discountRupiah,
  };
}
