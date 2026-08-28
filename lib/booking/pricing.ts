/**
 * Pure booking-pricing math (I-040, spec 0007). No DB access — the
 * tier-discount lookup (getTierDiscounts) is resolved by the caller and
 * passed in as a plain percentage (AC-827 consumption lands with the
 * createBooking rewrite, Phase 5). NFR-800: integer Rupiah, Math.round for
 * discount rounding.
 */

export type BookingPrice = {
  baseAmountRupiah: number;
  discountRupiah: number;
  amountRupiah: number;
};

/**
 * `discountPct` applies to `hours × ratePerHourRupiah` (OBS-816), rounded
 * with `Math.round` (AC-814, NFR-800) — never truncated.
 */
export function computeBookingPrice(o: {
  hours: number;
  ratePerHourRupiah: number;
  discountPct: number;
}): BookingPrice {
  const baseAmountRupiah = o.hours * o.ratePerHourRupiah;
  const discountRupiah = Math.round((baseAmountRupiah * o.discountPct) / 100);
  return {
    baseAmountRupiah,
    discountRupiah,
    amountRupiah: baseAmountRupiah - discountRupiah,
  };
}

/**
 * Walk-in provisional/final billed hours: elapsed time rounds UP to the next
 * whole hour (OBS-817), with a minimum of 1 billed hour, capped at the
 * facility's `maxHours` (OBS-820/AC-812/AC-844).
 */
export function computeWalkinBilledHours(elapsedMs: number, maxHours: number): number {
  return Math.min(Math.max(Math.ceil(elapsedMs / 3_600_000), 1), maxHours);
}
