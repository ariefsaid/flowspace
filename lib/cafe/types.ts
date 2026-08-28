/**
 * Shared type contract for the cafe domain (I-022, extended I-044).
 * Import enums from @/lib/db/enums (the hand-authored source, ADR-0015); define DTO shapes here.
 */
import type { CafeCategory, CafeOrderStatus, DrinkTemperature, SugarLevel } from "@/lib/db/enums";
export type { CafeCategory, CafeOrderStatus, DrinkTemperature, SugarLevel };

// ---------------------------------------------------------------------------
// Generic priced-variant contract (I-044, FR-720). Replaces reliance on the
// fixed temperature/sugar columns for new writes; those remain only as
// nullable compatibility columns for pre-I-044 rows (NFR-044-04).
// ---------------------------------------------------------------------------

/** One selectable option within a variant group, with its Rupiah price delta. */
export interface VariantOption {
  name: string;
  priceAdjustment: number;
}

/** A named group of options (e.g. "Sugar"), optionally required. */
export interface VariantGroup {
  name: string;
  required: boolean;
  options: VariantOption[];
}

/** The full `cafe_menu_items.variant_config` JSONB shape (FR-720). */
export interface VariantConfig {
  variants: VariantGroup[];
}

/** A client-submitted selection: which option was chosen for which group. */
export interface VariantSelectionInput {
  variantName: string;
  optionName: string;
}

/** The canonical persisted snapshot for one selected option (FR-723). */
export interface VariantOptionSnapshot {
  variantName: string;
  optionName: string;
  priceAdjustmentRupiah: number;
}

/** A requested order line BEFORE pricing/persistence (client sends menuItemId + qty + optional selections). */
export interface OrderLineInput {
  menuItemId: string;
  qty: number;
  options?: VariantSelectionInput[] | null;
}

/** A priced line: menu price + validated option adjustments snapshotted server-side. */
export interface PricedLine {
  menuItemId: string;
  nameSnapshot: string;
  qty: number;
  unitPriceRupiah: number;
  variantOptions: VariantOptionSnapshot[];
}

export interface OrderTotals {
  subtotalRupiah: number;
  discountRupiah: number;
  totalRupiah: number;
}
