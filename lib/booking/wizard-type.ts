/**
 * Wizard-type → domain-enum mapping (I-040, Phase 7). Single source of truth
 * shared by the member booking server action (app/(member)/booking/actions.ts)
 * and the client wizard (BookingClient/Step4Confirm), so the two never drift
 * on how a Step1 choice maps to `BookingFacilityType` / the catalog
 * `FacilityType` used to query the floor plan. Pure, no DB import — safe to
 * import from both a server action and a "use client" leaf.
 */
import type { BookingFacilityType, FacilityType } from "@/lib/db/enums";
import type { BookingType } from "@/components/member/booking/Step1Type";

/** Step1 choice → the domain's BookingFacilityType (walk-in stays a distinct type). */
export function wizardTypeToFacilityType(t: BookingType): BookingFacilityType {
  switch (t) {
    case "walkin-coworking":
      return "WALKIN_COWORKING";
    case "walkin-meeting":
      return "WALKIN_MEETING";
    case "scheduled-coworking":
      return "COWORKING_SEAT";
    case "scheduled-meeting":
      return "MEETING_ROOM";
    case "scheduled-fullroom":
      return "FULL_ROOM";
  }
}

/**
 * Step1 choice → the catalog `facilities.type` to query for place selection.
 * Walk-in coworking/meeting show the SAME catalog rows as their scheduled
 * counterparts (the floor plan is informational for a walk-in — the backend
 * never persists a specific facility_id for a walk-in booking, OBS-808).
 */
export function wizardTypeToCatalogFacilityType(t: BookingType): FacilityType {
  if (t === "walkin-coworking" || t === "scheduled-coworking") return "COWORKING_SEAT";
  if (t === "walkin-meeting" || t === "scheduled-meeting") return "MEETING_ROOM";
  return "FULL_ROOM";
}

export function isWalkinBookingType(t: BookingType): boolean {
  return t === "walkin-coworking" || t === "walkin-meeting";
}
