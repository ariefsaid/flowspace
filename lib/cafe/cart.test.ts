/**
 * Unit tests for lib/cafe/cart.ts (I-044, FR-721 UI contract).
 */
import { describe, it, expect } from "vitest";
import { cartLineKey, addCartLine } from "@/lib/cafe/cart";
import type { CartLine } from "@/lib/cafe/cart";

function line(menuItemId: string, options: CartLine["options"], qty = 1): CartLine {
  return { key: cartLineKey(menuItemId, options), menuItemId, options, qty };
}

describe("cartLineKey", () => {
  it("is stable regardless of selection order (same combination → same key)", () => {
    const a = cartLineKey("kopi-susu", [
      { variantName: "Sugar", optionName: "Normal Sugar" },
      { variantName: "Temperature", optionName: "Hot" },
    ]);
    const b = cartLineKey("kopi-susu", [
      { variantName: "Temperature", optionName: "Hot" },
      { variantName: "Sugar", optionName: "Normal Sugar" },
    ]);
    expect(a).toBe(b);
  });

  it("differs for different option combinations on the same item", () => {
    const hot = cartLineKey("kopi-susu", [{ variantName: "Temperature", optionName: "Hot" }]);
    const cold = cartLineKey("kopi-susu", [{ variantName: "Temperature", optionName: "Cold" }]);
    expect(hot).not.toBe(cold);
  });

  it("a no-variant item and a variant item never collide", () => {
    const noVariant = cartLineKey("croissant", []);
    const variant = cartLineKey("croissant", [{ variantName: "Size", optionName: "Large" }]);
    expect(noVariant).not.toBe(variant);
  });

  it("[MONEY] never collides two DISTINCT selection sets even when a variant/option name contains '&' or '='", () => {
    // A single-group selection whose option name itself looks like a second
    // "name=value" pair vs. a genuinely two-group selection — a naive
    // `name=option` joined by `&` produces the IDENTICAL string for both:
    //   "A=x&B=y" (one group "A", option "x&B=y")
    //   "A=x&B=y" (two groups: "A"="x", "B"="y")
    // These are DIFFERENT selections (different priced combinations) and must
    // never share a cart line / key.
    const oneGroupWithAmpersandInOptionName = cartLineKey("kopi-susu", [
      { variantName: "A", optionName: "x&B=y" },
    ]);
    const twoDistinctGroups = cartLineKey("kopi-susu", [
      { variantName: "A", optionName: "x" },
      { variantName: "B", optionName: "y" },
    ]);
    expect(oneGroupWithAmpersandInOptionName).not.toBe(twoDistinctGroups);
  });

  it("[MONEY] sorts option names containing quotes/backslashes/unicode without crashing, still order-independent", () => {
    const opts1 = [
      { variantName: 'Size "Large"', optionName: "Back\\slash" },
      { variantName: "🍵 Tea", optionName: "無糖 (no sugar)" },
    ];
    const opts2 = [
      { variantName: "🍵 Tea", optionName: "無糖 (no sugar)" },
      { variantName: 'Size "Large"', optionName: "Back\\slash" },
    ];
    expect(cartLineKey("item", opts1)).toBe(cartLineKey("item", opts2));
  });

  it("[MONEY] a collation-equivalent-but-code-unit-distinct pair still merges when submitted in reversed order", () => {
    // "café" precomposed (U+00E9 é) vs "café" decomposed (U+0065 U+0301,
    // combining acute) render identically and are collation-equivalent
    // (`"café".localeCompare("café") === 0`) but are DIFFERENT strings
    // (different code units) — legally distinct variant group/option names.
    // A localeCompare-based sort ties on this pair; Array.sort is STABLE, so
    // a tie preserves INPUT order rather than a canonical order — the same
    // logical selection set submitted in reversed order then produces a
    // DIFFERENT key, and two identical carts fail to merge. The comparator
    // must be a genuine total order (code-unit `<`/`>`), not localeCompare.
    const precomposed = "café";
    const decomposed = "café";
    expect(precomposed).not.toBe(decomposed); // sanity: distinct strings
    expect(precomposed.localeCompare(decomposed)).toBe(0); // sanity: the trap

    const itemA = { variantName: precomposed, optionName: precomposed };
    const itemB = { variantName: decomposed, optionName: decomposed };

    const forward = cartLineKey("item", [itemA, itemB]);
    const reversed = cartLineKey("item", [itemB, itemA]);
    expect(forward).toBe(reversed);
  });
});

describe("addCartLine (AC-704)", () => {
  it("AC-704: Hot and Cold selections remain separate cart lines", () => {
    let cart: CartLine[] = [];
    cart = addCartLine(cart, line("kopi-susu", [{ variantName: "Temperature", optionName: "Hot" }]));
    cart = addCartLine(cart, line("kopi-susu", [{ variantName: "Temperature", optionName: "Cold" }]));
    expect(cart).toHaveLength(2);
  });

  it("AC-704: adding the same selection again merges quantity into one line", () => {
    let cart: CartLine[] = [];
    cart = addCartLine(cart, line("kopi-susu", [{ variantName: "Temperature", optionName: "Hot" }]));
    cart = addCartLine(cart, line("kopi-susu", [{ variantName: "Temperature", optionName: "Hot" }]));
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(2);
  });

  it("AC-704: a same-item no-variant line does not merge with a variant line", () => {
    let cart: CartLine[] = [];
    cart = addCartLine(cart, line("croissant", []));
    cart = addCartLine(cart, line("croissant", [{ variantName: "Size", optionName: "Large" }]));
    expect(cart).toHaveLength(2);
  });
});
