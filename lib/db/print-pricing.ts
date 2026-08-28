/**
 * Repository: org_print_pricing (I-043, spec 0009). [SEC] money path.
 *
 * Per-org print-price matrix — one row per (org_id, color_mode, paper_size).
 * Server-derived `orgId` only; clients never supply it (ADR-0004). There is NO
 * fallback price: a missing or inactive cell resolves to `null` and the caller
 * must reject (FR-631). Writes validate paper size, positive integer Rupiah,
 * and int4 bounds before any upsert.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { orgPrintPricing, type OrgPrintPricing } from "@/lib/db/schema";
import type { PrintColorMode } from "@/lib/db/enums";

export const PRINT_PAPER_SIZES = ["A4", "A3", "F4"] as const;
export type PrintPaperSize = (typeof PRINT_PAPER_SIZES)[number];

const INT4_MAX = 2147483647;

function isPaperSize(v: string): v is PrintPaperSize {
  return (PRINT_PAPER_SIZES as readonly string[]).includes(v);
}

function assertValidCell(cell: {
  colorMode: PrintColorMode;
  paperSize: string;
  pricePerPageRupiah: number;
}): void {
  if (!isPaperSize(cell.paperSize)) {
    throw new Error(`INVALID_PAPER_SIZE:${cell.paperSize}`);
  }
  if (
    !Number.isInteger(cell.pricePerPageRupiah) ||
    cell.pricePerPageRupiah <= 0 ||
    cell.pricePerPageRupiah > INT4_MAX
  ) {
    throw new Error("INVALID_RATE");
  }
}

/**
 * All matrix rows for the org (admin editor + member capability render).
 */
export function listPrintPricing(orgId: string): Promise<OrgPrintPricing[]> {
  return db
    .select()
    .from(orgPrintPricing)
    .where(eq(orgPrintPricing.orgId, orgId))
    .orderBy(asc(orgPrintPricing.colorMode), asc(orgPrintPricing.paperSize));
}

/**
 * The active per-page rate for one matrix cell, or `null` when the cell is
 * missing or inactive. Callers MUST treat `null` as a rejection — there is no
 * fallback price (FR-631 / divergence from ORIG's silent Rp500).
 */
export async function getActivePrintPrice(
  orgId: string,
  colorMode: PrintColorMode,
  paperSize: string,
): Promise<number | null> {
  const [row] = await db
    .select({ price: orgPrintPricing.pricePerPageRupiah })
    .from(orgPrintPricing)
    .where(
      and(
        eq(orgPrintPricing.orgId, orgId),
        eq(orgPrintPricing.colorMode, colorMode),
        eq(orgPrintPricing.paperSize, paperSize),
        eq(orgPrintPricing.isActive, true),
      ),
    )
    .limit(1);
  return row?.price ?? null;
}

export type Txdb = Pick<typeof db, "insert">;

/**
 * Upsert one matrix cell for the org (ADMIN-only — the caller enforces role).
 * Validates paper size + positive integer price + int4 bounds before writing;
 * the unique (org, mode, paper) key makes the write idempotent.
 */
export async function upsertPrintPricingCell(
  orgId: string,
  cell: {
    colorMode: PrintColorMode;
    paperSize: string;
    pricePerPageRupiah: number;
    isActive?: boolean;
  },
  txdb: Txdb = db,
): Promise<void> {
  assertValidCell(cell);
  const isActive = cell.isActive ?? true;
  await txdb
    .insert(orgPrintPricing)
    .values({
      orgId,
      colorMode: cell.colorMode,
      paperSize: cell.paperSize,
      pricePerPageRupiah: cell.pricePerPageRupiah,
      isActive,
    })
    .onConflictDoUpdate({
      target: [orgPrintPricing.orgId, orgPrintPricing.colorMode, orgPrintPricing.paperSize],
      set: {
        pricePerPageRupiah: cell.pricePerPageRupiah,
        isActive,
        updatedAt: new Date(),
      },
    });
}

// ---------------------------------------------------------------------------
// Legacy A4 bridge (I-027 tiers settings page edits BW/COLOR A4). The matrix
// above is the authority; these map the flat editor onto the two A4 cells.
// NOTE: the bridge reads fall back to the SIGNED A4 defaults only so the legacy
// editor can render before migration 0013 seeds a matrix — submitPrintJob (the
// money path) never uses this fallback (it resolves cells via getActivePrintPrice
// and rejects null, FR-631).
// ---------------------------------------------------------------------------

export type PrintPricing = {
  bwRatePerPageRupiah: number;
  colorRatePerPageRupiah: number;
};

/** The org's A4 BW/COLOR rates, or the signed A4 defaults when unconfigured. */
export async function getPrintPricing(orgId: string): Promise<PrintPricing> {
  const [bw, color] = await Promise.all([
    getActivePrintPrice(orgId, "BW", "A4"),
    getActivePrintPrice(orgId, "COLOR", "A4"),
  ]);
  return {
    bwRatePerPageRupiah: bw ?? 500,
    colorRatePerPageRupiah: color ?? 2000,
  };
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0 || value > INT4_MAX) {
    throw new Error(`INVALID_RATE:${label}`);
  }
}

/**
 * Upsert the org's A4 BW/COLOR rates (ADMIN-only — caller enforces role).
 * Legacy flat-rate editor; writes the two A4 matrix cells.
 */
export async function updatePrintPricing(
  orgId: string,
  rates: { bwRatePerPageRupiah: number; colorRatePerPageRupiah: number },
  txdb: Txdb = db,
): Promise<void> {
  assertPositiveInt(rates.bwRatePerPageRupiah, "bw");
  assertPositiveInt(rates.colorRatePerPageRupiah, "color");
  await upsertPrintPricingCell(
    orgId,
    { colorMode: "BW", paperSize: "A4", pricePerPageRupiah: rates.bwRatePerPageRupiah },
    txdb,
  );
  await upsertPrintPricingCell(
    orgId,
    { colorMode: "COLOR", paperSize: "A4", pricePerPageRupiah: rates.colorRatePerPageRupiah },
    txdb,
  );
}
