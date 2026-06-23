/**
 * Server-side print-job pricing (I-023 / I-027, [SEC] money path).
 * Pure function — no DB access. The repository calls this AFTER loading the org's
 * per-page base rates (org_print_pricing) and the member tier's discount %
 * (membership_tier_config); the client preview is never trusted.
 */
import type { PrintColorMode } from "@/lib/db/enums";

/** Default base rates (recon calculator) — the seed/fallback for org_print_pricing. */
export const PRINT_RATE_BW = 500;
// ponytail: COLOR multiplier unknown from recon — assume 3× BW (Rp 1.500). Seeded
// into org_print_pricing (I-027) and admin-editable; this is only the fallback.
export const PRINT_RATE_COLOR = 1500;

/** Default per-tier print discount % (the seed for membership_tier_config.print_discount_pct). */
export const DEFAULT_PRINT_DISCOUNT_PCT = { REGULAR: 0, PREMIUM: 20, GOLD: 20 } as const;

export interface PrintTotal {
  /** Per-page rate applied (BW or COLOR), in Rupiah. */
  pricePerPageRupiah: number;
  /** Absolute discount in Rupiah (rounded). */
  discountRupiah: number;
  /** Chargeable total in Rupiah (subtotal − discount). */
  totalRupiah: number;
}

/**
 * Computes the per-page rate, discount, and chargeable total for a print job.
 * `pages` × `copies` sheets at the resolved base rate; `discountPct` (0–100) is
 * the member tier's print discount, resolved server-side from config.
 */
export function computePrintTotal(input: {
  pages: number;
  copies: number;
  colorMode: PrintColorMode;
  bwRateRupiah: number;
  colorRateRupiah: number;
  discountPct: number;
}): PrintTotal {
  const pricePerPageRupiah =
    input.colorMode === "BW" ? input.bwRateRupiah : input.colorRateRupiah;
  const subtotal = pricePerPageRupiah * input.pages * input.copies;
  const discountRupiah = Math.round(subtotal * (input.discountPct / 100));
  return {
    pricePerPageRupiah,
    discountRupiah,
    totalRupiah: subtotal - discountRupiah,
  };
}
