/**
 * Shared cart identity/merge behavior for the member/guest/POS variant cart
 * UIs (I-044, FR-721 UI contract). Generic over any configured variant
 * groups — no hardcoded temperature/sugar comparisons.
 */
import type { VariantSelectionInput } from "@/lib/cafe/types";

export interface CartLine {
  /** Stable key = menuItemId + ordered selections (see cartLineKey). */
  key: string;
  menuItemId: string;
  options: VariantSelectionInput[];
  qty: number;
}

/**
 * Builds a stable cart-line key: the same set of selections (in any input
 * order) always produces the same key, and different combinations (or no
 * selections at all) never collide.
 */
export function cartLineKey(
  menuItemId: string,
  options?: VariantSelectionInput[] | null,
): string {
  const sorted = [...(options ?? [])].sort((a, b) =>
    a.variantName.localeCompare(b.variantName),
  );
  const optPart = sorted.map((o) => `${o.variantName}=${o.optionName}`).join("&");
  return optPart ? `${menuItemId}::${optPart}` : menuItemId;
}

/**
 * Adds a line to the cart, merging its quantity into an existing line with
 * the identical key (same menu item + same selections) rather than adding a
 * duplicate row. Returns a new array (immutable).
 */
export function addCartLine<T extends { key: string; qty: number }>(
  lines: T[],
  line: T,
): T[] {
  const idx = lines.findIndex((l) => l.key === line.key);
  if (idx === -1) return [...lines, line];
  return lines.map((l, i) => (i === idx ? { ...l, qty: l.qty + line.qty } : l));
}
