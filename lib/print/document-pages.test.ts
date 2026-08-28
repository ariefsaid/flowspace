/**
 * Unit tests for getPdfPageCount robustness (I-043 hotfix).
 *
 * A PDF that loads (valid magic bytes) but has no valid page tree makes
 * pdf-lib's getPageCount() throw an uncaught TypeError. Both load failures
 * AND getPageCount() internal throws must surface as a clean INVALID_PDF
 * Error — never an uncaught TypeError.
 *
 * Forced to the `node` environment: under jsdom, pdf-lib's own type guard on
 * `Buffer.from(...)` rejects the input before it ever reaches
 * `getPageCount()`, which would mask the real bug (the print server action
 * runs in Node, not jsdom).
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { getPdfPageCount } from "./document-pages";

describe("getPdfPageCount", () => {
  it("throws INVALID_PDF (not a TypeError) for a PDF with no valid page tree", async () => {
    const bytes = Buffer.from(
      "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF",
    );

    await expect(getPdfPageCount(bytes)).rejects.toThrow("INVALID_PDF");
  });

  it("returns 1 for a truly valid 1-page PDF", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();

    await expect(getPdfPageCount(bytes)).resolves.toBe(1);
  });

  it("throws INVALID_PDF for garbage bytes that fail to load", async () => {
    const bytes = Buffer.from("not a pdf at all");

    await expect(getPdfPageCount(bytes)).rejects.toThrow("INVALID_PDF");
  });
});
