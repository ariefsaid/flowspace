import type { MenuItem } from "@/lib/mock";
import type { VariantSelection } from "./VariantModal";

export interface CartItem {
  /** Unique key = itemId + variant string (for deduplication). */
  key: string;
  id: string;
  name: string;
  emoji: string;
  price: number;
  qty: number;
  variant?: VariantSelection;
}

export function cartKey(item: MenuItem, variant?: VariantSelection): string {
  if (!variant) return item.id;
  return `${item.id}__${variant.temp}__${variant.sugar}`;
}
