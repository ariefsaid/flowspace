/**
 * PDF page-count extraction from raw bytes (I-043, spec 0009). [SEC]
 *
 * FR-632: the server derives PDF page counts from the uploaded bytes — never
 * from client metadata. Run AFTER validatePrintMagicBytes (so the leading
 * `%PDF` signature already matched) and BEFORE any Storage upload or DB write.
 */
import { PDFDocument } from "pdf-lib";

/**
 * Parse a PDF from bytes and return its page count.
 * Throws `INVALID_PDF` on corrupt/truncated/encrypted documents.
 */
export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
  } catch {
    throw new Error("INVALID_PDF");
  }
  const count = doc.getPageCount();
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("INVALID_PDF");
  }
  return count;
}
