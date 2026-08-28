import type { VariantSelectionInput } from "@/lib/cafe/types";
import { cartLineKey } from "@/lib/cafe/cart";

export interface CartItem {
  /** Unique key = itemId + ordered selections (for deduplication, I-044). */
  key: string;
  id: string;
  name: string;
  emoji: string;
  /** Display-only unit price (base + selected adjustments); the server recomputes it (I-044, [SEC]). */
  price: number;
  qty: number;
  options: VariantSelectionInput[];
}

/** Stable cart key for a menu item + its selections (I-044; delegates to the shared cart helper). */
export function cartKey(menuItemId: string, options: VariantSelectionInput[]): string {
  return cartLineKey(menuItemId, options);
}
