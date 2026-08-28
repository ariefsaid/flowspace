/**
 * Server-side page-range parsing (I-043, spec 0009). Pure function — no DB.
 *
 * FR-632: parse `all` or a strict comma-separated list of single pages and
 * inclusive ranges (`1-5,8,10-12`), validate every endpoint against the
 * document page count, and compute effective sheets as parsed count × copies.
 * Invalid syntax, reversed/overlapping/duplicate/out-of-bounds ranges are
 * rejected with a sentinel error — callers must reject BEFORE any DB write.
 */
const INT4_MAX = 2147483647;

export type ParsedPageRange = {
  /** Number of distinct document pages the range selects. */
  pageCount: number;
  /** Canonical ascending form (consecutive runs collapsed), e.g. `1-5,8,10-12`. */
  normalized: string;
};

/** One strict token: `N` or `A-B` (ASCII digits only — no signs, spaces, or decimals). */
const TOKEN_RE = /^(\d+)(?:-(\d+))?$/;

function assertDocumentPages(documentPages: number): void {
  if (!Number.isInteger(documentPages) || documentPages <= 0) {
    throw new Error("INVALID_DOCUMENT_PAGES");
  }
}

/**
 * Parse a member-supplied page range against the document's page count.
 *
 * - `all` selects every page (1..documentPages).
 * - Tokens are strict decimal singles/ranges; whitespace around tokens is
 *   tolerated, everything else is malformed.
 * - Zero, reversed, out-of-bounds, duplicate, and overlapping selections are
 *   rejected (`INVALID_PAGE_RANGE`) — no partial acceptance.
 */
export function parsePageRange(
  range: string,
  documentPages: number,
): ParsedPageRange {
  assertDocumentPages(documentPages);

  const trimmed = (range ?? "").trim();
  if (!trimmed) throw new Error("INVALID_PAGE_RANGE");

  const selected = new Set<number>();

  if (trimmed.toLowerCase() === "all") {
    for (let p = 1; p <= documentPages; p++) selected.add(p);
    return { pageCount: documentPages, normalized: "all" };
  }

  const tokens = trimmed.split(",");
  for (const rawToken of tokens) {
    const token = rawToken.trim();
    const match = TOKEN_RE.exec(token);
    if (!match) throw new Error("INVALID_PAGE_RANGE");

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);

    if (start < 1 || end < 1) throw new Error("INVALID_PAGE_RANGE"); // zero / leading zeros like 000 are still parsed; 0 rejects
    if (end < start) throw new Error("INVALID_PAGE_RANGE"); // reversed
    if (end > documentPages) throw new Error("INVALID_PAGE_RANGE"); // out of bounds

    for (let p = start; p <= end; p++) {
      if (selected.has(p)) throw new Error("INVALID_PAGE_RANGE"); // duplicate/overlap
      selected.add(p);
    }
  }

  // Canonical output: ascending pages collapsed into consecutive runs.
  const pages = [...selected].sort((a, b) => a - b);
  const parts: string[] = [];
  let runStart = pages[0];
  let prev = pages[0];
  for (let i = 1; i <= pages.length; i++) {
    const p = pages[i];
    if (p === prev + 1) {
      prev = p;
      continue;
    }
    parts.push(runStart === prev ? `${runStart}` : `${runStart}-${prev}`);
    runStart = p;
    prev = p;
  }

  return { pageCount: pages.length, normalized: parts.join(",") };
}

/**
 * Effective sheets = parsed page count × copies (OBS-604). Validates copies is
 * a positive integer and the product stays within the int4 column bound so the
 * value can always be persisted (`total_pages`).
 */
export function computeEffectiveSheets(pageCount: number, copies: number): number {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error("INVALID_DOCUMENT_PAGES");
  }
  if (!Number.isInteger(copies) || copies <= 0) {
    throw new Error("INVALID_COPIES");
  }
  const sheets = pageCount * copies;
  if (!Number.isSafeInteger(sheets) || sheets > INT4_MAX) {
    throw new Error("TOO_MANY_SHEETS");
  }
  return sheets;
}
