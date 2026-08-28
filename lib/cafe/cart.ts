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
 *
 * Variant group/option names are free-form strings (lib/cafe/variants.ts only
 * requires non-empty, not a restricted charset) and may legally contain `&`
 * or `=`. A raw `${name}=${option}` joined by `&` is therefore NOT
 * collision-free: a single group whose option name itself contains "&B=y"
 * can produce the exact same string as two separate groups "A"="x","B"="y" —
 * merging two DISTINCT, differently-priced selections under one cart line
 * ([MONEY] undercharge). Each option is first reduced to its own canonical
 * `JSON.stringify` string (unambiguous regardless of what characters the
 * names contain), THEN the set of canonical strings is sorted.
 *
 * The sort comparator MUST be a genuine total order over those strings —
 * plain code-unit `<`/`>`, never `localeCompare`. Locale collation treats
 * some distinct Unicode strings as equal (e.g. precomposed vs. decomposed
 * accents: `"café".localeCompare("café")` — combining-acute form — `=== 0`
 * even though they are different strings). `Array.prototype.sort` is
 * stable, so a comparator that "ties" on such a pair preserves INPUT order
 * rather than resolving to one canonical order — the exact same selection
 * set submitted in a different array order then produces a DIFFERENT key,
 * so two identical carts fail to merge ([MONEY]).
 */
export function cartLineKey(
  menuItemId: string,
  options?: VariantSelectionInput[] | null,
): string {
  const canonicalOptions = (options ?? [])
    .map((o) => JSON.stringify({ variantName: o.variantName, optionName: o.optionName }))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return canonicalOptions.length
    ? `${menuItemId}::[${canonicalOptions.join(",")}]`
    : menuItemId;
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
