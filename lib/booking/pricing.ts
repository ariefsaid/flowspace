/**
 * Pure booking-pricing math (I-040, spec 0007). No DB access — the
 * tier-discount lookup (getTierDiscounts) is resolved by the caller and
 * passed in as a plain percentage. NFR-800: integer Rupiah, Math.round for
 * discount rounding.
 */
import type { BookingFacilityType } from "@/lib/db/enums";

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

/**
 * Picks the tier-discount dimension a booking's facility type owns
 * (OBS-816): coworking desks/counters (scheduled or walk-in) read
 * `coworkingDiscountPct`, meeting rooms (scheduled or walk-in) read
 * `meetingDiscountPct`. `FULL_ROOM` owns neither dimension and fails safe to
 * 0% (AC-827) — same fail-safe as a missing tier-config row.
 */
export function resolveDiscountPct(
  facilityType: BookingFacilityType,
  discounts: { coworkingDiscountPct: number; meetingDiscountPct: number },
): number {
  if (facilityType === "COWORKING_SEAT" || facilityType === "WALKIN_COWORKING") {
    return discounts.coworkingDiscountPct;
  }
  if (facilityType === "MEETING_ROOM" || facilityType === "WALKIN_MEETING") {
    return discounts.meetingDiscountPct;
  }
  return 0;
}
