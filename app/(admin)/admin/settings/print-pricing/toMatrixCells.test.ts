/**
 * toMatrixCells builds the full 6-cell (BW|COLOR × A4|A3|F4) matrix from
 * whatever rows the org has configured, filling any missing cell with an
 * unconfigured placeholder rather than dropping it from the grid (FR-631 —
 * the editor must always offer all 6 cells, even before migration seeds
 * them for the org).
 */
import { describe, it, expect } from "vitest";
import { toMatrixCells } from "./toMatrixCells";
import type { OrgPrintPricing } from "@/lib/db/schema";

function row(overrides: Partial<OrgPrintPricing>): OrgPrintPricing {
  return {
    id: "id",
    orgId: "org1",
    colorMode: "BW",
    paperSize: "A4",
    pricePerPageRupiah: 500,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("toMatrixCells", () => {
  it("AC-P01: an empty row set still returns all 6 cells, each unconfigured", () => {
    const cells = toMatrixCells([]);
    expect(cells).toHaveLength(6);
    expect(cells.every((c) => c.configured === false)).toBe(true);
    expect(cells.every((c) => c.pricePerPageRupiah === 0)).toBe(true);
    // covers every (colorMode, paperSize) combination exactly once
    const keys = cells.map((c) => `${c.colorMode}:${c.paperSize}`).sort();
    expect(keys).toEqual(
      ["BW:A3", "BW:A4", "BW:F4", "COLOR:A3", "COLOR:A4", "COLOR:F4"].sort(),
    );
  });

  it("AC-P02: a configured row maps its price/isActive onto its cell and marks it configured", () => {
    const cells = toMatrixCells([
      row({ colorMode: "BW", paperSize: "A4", pricePerPageRupiah: 500, isActive: true }),
      row({ colorMode: "COLOR", paperSize: "A3", pricePerPageRupiah: 3000, isActive: false }),
    ]);
    const bwA4 = cells.find((c) => c.colorMode === "BW" && c.paperSize === "A4");
    expect(bwA4).toMatchObject({ pricePerPageRupiah: 500, isActive: true, configured: true });
    const colorA3 = cells.find((c) => c.colorMode === "COLOR" && c.paperSize === "A3");
    expect(colorA3).toMatchObject({ pricePerPageRupiah: 3000, isActive: false, configured: true });
    // unconfigured cells remain untouched
    const bwF4 = cells.find((c) => c.colorMode === "BW" && c.paperSize === "F4");
    expect(bwF4).toMatchObject({ configured: false, pricePerPageRupiah: 0 });
  });
});
