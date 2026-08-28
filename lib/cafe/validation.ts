/**
 * Reusable order note / quantity guards (I-044, FR-724, NFR-044-03).
 * Pure functions — call both before any repository write.
 */

const MAX_NOTES_LENGTH = 500;
const MAX_QTY_PER_LINE = 99;
const MAX_LINES_PER_ORDER = 50;

/**
 * Trims `value`, normalizes a blank/whitespace-only result to `null`, and
 * rejects (throws `INVALID_NOTES`) a trimmed value over 500 Unicode code
 * points (counted via `Array.from`, not UTF-16 code units, so astral-plane
 * emoji count as one character each).
 */
export function normalizeOrderNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (Array.from(trimmed).length > MAX_NOTES_LENGTH) {
    throw new Error("INVALID_NOTES");
  }
  return trimmed;
}

/**
 * Throws `TOO_MANY_LINES` when an order carries more than 50 distinct lines.
 * A single legitimate order — even a large group tab — never approaches this;
 * it caps a bot/script flooding thousands of qty:1 lines on any order path
 * (member/guest/POS all share this guard via `createOrder`) before any DB
 * work happens ([MONEY]/DoS). Does not reject an empty array — `EMPTY_ORDER`
 * is a separate, earlier guard.
 */
export function assertOrderLineCount(lines: unknown[]): void {
  if (lines.length > MAX_LINES_PER_ORDER) {
    throw new Error("TOO_MANY_LINES");
  }
}

/** Throws `INVALID_QUANTITY` unless `qty` is an integer in `1..99`. */
export function assertOrderLineQuantity(qty: unknown): void {
  if (
    typeof qty !== "number" ||
    !Number.isInteger(qty) ||
    qty <= 0 ||
    qty > MAX_QTY_PER_LINE
  ) {
    throw new Error("INVALID_QUANTITY");
  }
}
