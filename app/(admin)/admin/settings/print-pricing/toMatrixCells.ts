/**
 * Pure mapper: the org's sparse print-pricing rows -> the full 6-cell
 * (BW|COLOR × A4|A3|F4) editor grid. A missing cell is NOT dropped — it
 * renders as an unconfigured placeholder the admin can fill in (FR-631,
 * spec 0009: there is no fallback price, so the editor must make every
 * cell reachable even before it has been saved once).
 */
import type { OrgPrintPricing } from "@/lib/db/schema";
import { PRINT_COLOR_MODES, PRINT_PAPER_SIZES, type PrintColorMode, type PrintPaperSize } from "@/lib/db/enums";

export type MatrixCell = {
  colorMode: PrintColorMode;
  paperSize: PrintPaperSize;
  pricePerPageRupiah: number;
  isActive: boolean;
  /** false when the org has never saved this (colorMode, paperSize) cell. */
  configured: boolean;
};

export function toMatrixCells(rows: OrgPrintPricing[]): MatrixCell[] {
  return PRINT_COLOR_MODES.flatMap((colorMode) =>
    PRINT_PAPER_SIZES.map((paperSize) => {
      const row = rows.find((r) => r.colorMode === colorMode && r.paperSize === paperSize);
      return row
        ? {
            colorMode,
            paperSize,
            pricePerPageRupiah: row.pricePerPageRupiah,
            isActive: row.isActive,
            configured: true,
          }
        : { colorMode, paperSize, pricePerPageRupiah: 0, isActive: true, configured: false };
    }),
  );
}
