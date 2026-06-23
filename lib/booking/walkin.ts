/**
 * Booking facility-type predicates (single source of truth).
 * Walk-in vs scheduled classification + the walk-in billing cap. Used by the
 * bookings repository (charge calc) and the member dashboard (active-session
 * display) so the rule lives in exactly one place.
 */
import type { BookingFacilityType } from "@/lib/db/enums";

/** Walk-in charge cap in hours (recon: "MAX 4h charge"). Enforced in completeBooking. */
export const WALKIN_MAX_HOURS = 4;

/** True for a walk-in (pay-at-cashier, capped) facility type. */
export function isWalkin(t: BookingFacilityType): boolean {
  return t === "WALKIN_COWORKING" || t === "WALKIN_MEETING";
}

/** True for a scheduled (seat/room, server-rated) facility type. */
export function isScheduled(t: BookingFacilityType): boolean {
  return t === "COWORKING_SEAT" || t === "MEETING_ROOM";
}
