/**
 * Shared type contract for the cafe domain (I-022).
 * Import enums from Prisma; define DTO shapes here.
 */
import type { CafeCategory, CafeOrderStatus, DrinkTemperature, SugarLevel } from "@prisma/client";
export type { CafeCategory, CafeOrderStatus, DrinkTemperature, SugarLevel };

/** A requested order line BEFORE pricing/persistence (client sends menuItemId + qty + optional variant). */
export interface OrderLineInput {
  menuItemId: string;
  qty: number;
  temperature?: DrinkTemperature | null;
  sugar?: SugarLevel | null;
}

/** A priced line: menu price snapshotted server-side. */
export interface PricedLine {
  menuItemId: string;
  nameSnapshot: string;
  qty: number;
  unitPriceRupiah: number;
  temperature?: DrinkTemperature | null;
  sugar?: SugarLevel | null;
}

export interface OrderTotals {
  subtotalRupiah: number;
  discountRupiah: number;
  totalRupiah: number;
}
