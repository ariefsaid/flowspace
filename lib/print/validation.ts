/**
 * Strict scalar validation for the member print submission (I-043, spec 0009).
 *
 * FormData arrives as strings; every scalar parses EXACTLY or rejects — no
 * `parseInt` prefix acceptance ("5abc" ≠ 5), no case folding, no defaults for
 * required values. All of this runs before any Storage upload or DB write.
 */
import type { PrintColorMode } from "@/lib/db/enums";
import { ALLOWED_PRINT_MIME_TYPES } from "@/lib/storage/uploads";

const INT4_MAX = 2147483647;
const STRICT_DECIMAL_RE = /^\d+$/;

/**
 * Parse a decimal string into a positive integer within int4 bounds.
 * Rejects: null/undefined/empty, non-digit characters (including prefixes,
 * decimals, signs, exponents, whitespace, non-ASCII digits), zero, overflow.
 */
export function parseStrictPositiveInt(
  raw: string | null | undefined,
  label: string,
): number {
  const value = (raw ?? "").trim();
  if (!value || !STRICT_DECIMAL_RE.test(value)) {
    throw new Error(`INVALID_${label}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > INT4_MAX) {
    throw new Error(`INVALID_${label}`);
  }
  return parsed;
}

/** Parse exactly `"true"` or `"false"` — anything else rejects. */
export function parseStrictBoolean(raw: string | null | undefined): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error("INVALID_BOOLEAN");
}

/** Parse exactly `"BW"` or `"COLOR"`. */
export function parsePrintColorMode(raw: string | null | undefined): PrintColorMode {
  if (raw === "BW" || raw === "COLOR") return raw;
  throw new Error("INVALID_COLOR_MODE");
}

/** Parse `"A4" | "A3" | "F4"`; omitted defaults to A4 (the legacy default). */
export function parsePrintPaperSize(raw: string | null | undefined): "A4" | "A3" | "F4" {
  if (raw === undefined || raw === null || raw === "") return "A4";
  if (raw === "A4" || raw === "A3" || raw === "F4") return raw;
  throw new Error("INVALID_PAPER_SIZE");
}

/**
 * Resolve the document page-count source (FR-632).
 *
 * - PDF: returns `null` — the page count MUST be derived from the bytes via
 *   `getPdfPageCount`; any client-supplied metadata is ignored.
 * - Accepted non-PDF formats (Office/images — no parseable page count on the
 *   server): require a strict positive-integer `documentPages` metadata value.
 * - A MIME type outside the upload allowlist rejects here (the upload gates
 *   re-check it, but submission never gets that far on a bad type).
 */
export function resolveDocumentPages(
  mimeType: string,
  input: { documentPages?: string | null },
): number | null {
  if (!ALLOWED_PRINT_MIME_TYPES.includes(mimeType)) {
    throw new Error("INVALID_FILE_TYPE");
  }
  if (mimeType === "application/pdf") return null;
  return parseStrictPositiveInt(input.documentPages, "DOCUMENT_PAGES");
}
