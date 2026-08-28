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
