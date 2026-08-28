/**
 * Server-side print-job pricing (I-043 / spec 0009, [SEC] money path).
 * Pure functions — no DB access. The repository resolves the org's matrix rows
 * (org_print_pricing) and the member tier's discount % (membership_tier_config)
 * and calls these AFTER loading; the client preview is never trusted.
 *
 * NFR-600: monetary and quantity values are integer Rupiah/sheets;
 * `discountRupiah = Math.round(grossRupiah × discountPct / 100)` and
 * `totalRupiah = grossRupiah − discountRupiah`; arithmetic above the
 * PostgreSQL int4 range rejects.
 *
 * The per-tier discount % applied via `discountPct` below is resolved
 * server-side from `membership_tier_config` via `getTierDiscounts`
 * (fail-safe 0%, I-041) — there is no local default constant here.
 */
import type { PrintColorMode } from "@/lib/db/enums";

/**
 * The six-cell print-price matrix (OBS-605 / AC-600) — the seed for
 * org_print_pricing: BW×A4=500, BW×A3=1000, BW×F4=600, COLOR×A4=2000,
 * COLOR×A3=4000, COLOR×F4=2500 integer Rupiah per sheet.
 * The repository (lib/db/print-pricing.ts) is the runtime authority; this is
 * the seed source only.
 */
export const PRINT_PRICE_MATRIX: Record<
  PrintColorMode,
  { A4: number; A3: number; F4: number }
> = {
  BW: { A4: 500, A3: 1000, F4: 600 },
  COLOR: { A4: 2000, A3: 4000, F4: 2500 },
};

/**
 * The six (colorMode, paperSize) cell keys in a stable order (seed + admin UI).
 */
export const PRINT_MATRIX_CELLS: Array<{
  colorMode: PrintColorMode;
  paperSize: "A4" | "A3" | "F4";
}> = [
  { colorMode: "BW", paperSize: "A4" },
  { colorMode: "BW", paperSize: "A3" },
  { colorMode: "BW", paperSize: "F4" },
  { colorMode: "COLOR", paperSize: "A4" },
  { colorMode: "COLOR", paperSize: "A3" },
  { colorMode: "COLOR", paperSize: "F4" },
];

const INT4_MAX = 2147483647;

/** A pricing row as loaded from `org_print_pricing` (matrix shape). */
export type PrintPriceRow = {
  colorMode: PrintColorMode;
  paperSize: string;
  pricePerPageRupiah: number;
  isActive: boolean;
};

/**
 * Resolve the per-page rate for one matrix cell from the org's loaded rows.
 *
 * FR-631: a missing OR inactive cell rejects with `INVALID_PRINT_PRICING` —
 * there is NO fallback rate (divergence from ORIG's silent Rp500). Callers must
 * reject the submission before any write.
 */
export function resolvePrintPrice(
  rows: readonly PrintPriceRow[],
  colorMode: PrintColorMode,
  paperSize: string,
): number {
  const row = rows.find(
    (r) => r.colorMode === colorMode && r.paperSize === paperSize,
  );
  if (!row || !row.isActive) throw new Error("INVALID_PRINT_PRICING");
  return row.pricePerPageRupiah;
}

export interface PrintTotal {
  /** Gross charge before the tier discount, in Rupiah. */
  grossRupiah: number;
  /** Absolute discount in Rupiah (rounded). */
  discountRupiah: number;
  /** Net charge in Rupiah (gross − discount). */
  totalRupiah: number;
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0 || value > INT4_MAX) {
    throw new Error(`INVALID_${label}`);
  }
}

/**
 * Compute gross, rounded integer discount, and net cost for a print job
 * (AC-602 / NFR-600). `pages` is the parsed selected-page count; effective
 * sheets = pages × copies. Duplex is NOT an input — it never changes sheets
 * or price (AC-636, persisted as a job option only).
 */
export function computePrintTotal(input: {
  pages: number;
  copies: number;
  pricePerPageRupiah: number;
  discountPct: number;
}): PrintTotal {
  assertPositiveInt(input.pages, "PAGES");
  assertPositiveInt(input.copies, "COPIES");
  assertPositiveInt(input.pricePerPageRupiah, "RATE");
  if (!Number.isInteger(input.discountPct) || input.discountPct < 0 || input.discountPct > 100) {
    throw new Error("INVALID_PCT");
  }

  const grossRupiah = input.pricePerPageRupiah * input.pages * input.copies;
  if (!Number.isSafeInteger(grossRupiah) || grossRupiah > INT4_MAX) {
    throw new Error("MONEY_OVERFLOW");
  }
  const discountRupiah = Math.round((grossRupiah * input.discountPct) / 100);
  return {
    grossRupiah,
    discountRupiah,
    totalRupiah: grossRupiah - discountRupiah,
  };
}
