/**
 * Unit tests for lib/print/validation.ts + document-pages.ts (I-043, spec 0009).
 *
 * Strict request-scalar validation for the member print submission: decimal
 * strings parse exactly (no parseInt prefix acceptance), booleans/color modes/
 * paper sizes are enumerated, and document page counts are required only for
 * accepted non-PDF files (PDF pages derive from the bytes via pdf-lib).
 * ('s owning test lives in lib/print/page-range.test.ts.)
 */
import { describe, it, expect } from "vitest";
import {
  parseStrictPositiveInt,
  parseStrictBoolean,
  parsePrintColorMode,
  parsePrintPaperSize,
  resolveDocumentPages,
} from "./validation";
import { getPdfPageCount } from "./document-pages";
import { PDFDocument } from "pdf-lib";

/** A minimal valid two-page PDF built with pdf-lib itself. */
async function tinyPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([297.64, 420.94]); // A4-ish
  return doc.save();
}

describe("parseStrictPositiveInt", () => {
  it("accepts exact decimal strings", () => {
    expect(parseStrictPositiveInt("1", "COPIES")).toBe(1);
    expect(parseStrictPositiveInt("24", "PAGES")).toBe(24);
    expect(parseStrictPositiveInt("2147483647", "PAGES")).toBe(2147483647);
  });

  it("rejects prefix garbage, decimals, signs, empty, zero, and int4 overflow", () => {
    // parseInt("5abc") === 5 — the exact bug class this guards.
    for (const bad of ["5abc", "abc", "1.5", "-3", "+3", "", "  ", "0x10", "1e3", "٣"]) {
      expect(() => parseStrictPositiveInt(bad, "COPIES")).toThrow(/INVALID_COPIES/);
    }
    expect(() => parseStrictPositiveInt("0", "COPIES")).toThrow(/INVALID_COPIES/);
    expect(() => parseStrictPositiveInt(null, "COPIES")).toThrow(/INVALID_COPIES/);
    expect(() => parseStrictPositiveInt("2147483648", "PAGES")).toThrow(/INVALID_PAGES/);
  });
});

describe("parseStrictBoolean / enums", () => {
  it("accepts only exact 'true'/'false'", () => {
    expect(parseStrictBoolean("true")).toBe(true);
    expect(parseStrictBoolean("false")).toBe(false);
    for (const bad of ["TRUE", "1", "yes", "", null, undefined]) {
      expect(() => parseStrictBoolean(bad as string | null)).toThrow(/INVALID_BOOLEAN/);
    }
  });

  it("accepts only exact BW/COLOR", () => {
    expect(parsePrintColorMode("BW")).toBe("BW");
    expect(parsePrintColorMode("COLOR")).toBe("COLOR");
    for (const bad of ["bw", "color", "GRIS", "", null, undefined]) {
      expect(() => parsePrintColorMode(bad as string | null)).toThrow(/INVALID_COLOR_MODE/);
    }
  });

  it("accepts only A4/A3/F4 (A4 default when omitted)", () => {
    expect(parsePrintPaperSize(undefined)).toBe("A4");
    expect(parsePrintPaperSize("A3")).toBe("A3");
    expect(parsePrintPaperSize("F4")).toBe("F4");
    // Omitted (undefined/null/"") defaults to A4; malformed values reject.
    expect(parsePrintPaperSize(null)).toBe("A4");
    expect(parsePrintPaperSize("")).toBe("A4");
    for (const bad of ["a4", "A5", "Letter"]) {
      expect(() => parsePrintPaperSize(bad as string | null)).toThrow(/INVALID_PAPER_SIZE/);
    }
  });
});

describe("resolveDocumentPages", () => {
  it("returns null for PDFs — pages always derive from the bytes (FR-632)", () => {
    expect(
      resolveDocumentPages("application/pdf", { documentPages: "99" }),
    ).toBeNull(); // client metadata ignored for PDFs
    expect(resolveDocumentPages("application/pdf", {})).toBeNull();
  });

  it("requires a strict positive integer for accepted non-PDF files", () => {
    expect(resolveDocumentPages("image/png", { documentPages: "3" })).toBe(3);
    expect(
      resolveDocumentPages(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        { documentPages: "12" },
      ),
    ).toBe(12);
    // Missing / non-positive / prefix-garbage metadata rejects.
    for (const bad of [undefined, null, "", "0", "-1", "1.5", "4abc"]) {
      expect(() =>
        resolveDocumentPages("image/png", { documentPages: bad as string | null | undefined }),
      ).toThrow(/INVALID_DOCUMENT_PAGES/);
    }
  });
});

describe("getPdfPageCount", () => {
  it("derives the page count from the PDF bytes themselves", async () => {
    expect(await getPdfPageCount(await tinyPdf(1))).toBe(1);
    expect(await getPdfPageCount(await tinyPdf(12))).toBe(12);
  });

  it("rejects non-PDF / corrupt bytes", async () => {
    await expect(getPdfPageCount(new TextEncoder().encode("not a pdf"))).rejects.toThrow(
      /INVALID_PDF/,
    );
    await expect(getPdfPageCount(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x21]))).rejects.toThrow(
      /INVALID_PDF/,
    );
  });
});
