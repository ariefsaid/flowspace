"use server";
/**
 * Booking server action (I-021). The orgId/userId are always resolved
 * server-side from the session; the client never supplies them (ADR-0004).
 *
 * [SEC] Money path:
 * - The scheduled facility + its rate are resolved WITHIN the org from the DB
 *   (createBooking re-validates and reads the rate from the facility row). The
 *   client only sends the selected facility *label*; never an id/price it
 *   controls.
 * - Walk-in rates are server-side constants (recon: Rp15.000 coworking,
 *   Rp120.000 meeting).
 * - durationHours is re-derived server-side from the start/end timestamps
 *   inside createBooking — never trusted from the client.
 */
import { requireSession } from "@/lib/auth/session";
import { createBooking } from "@/lib/db/bookings";
import type { BookingFacilityType } from "@/lib/db/enums";
import type { BookingType } from "@/components/member/booking/Step1Type";
import type { TimeSelection } from "@/components/member/booking/Step2Time";
import type { PlaceSelection } from "@/components/member/booking/Step3Place";

// Fixed walk-in rates (server-side; client never sends a price).
const WALKIN_COWORKING_RATE = 15_000;
const WALKIN_MEETING_RATE = 120_000;

/** Local-time "YYYY-MM-DD HH:MM" → Date. ponytail: no tz math; venue is id-ID. */
function parseStartAt(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}:00`);
}

export async function createBookingAction(input: {
  bookingType: BookingType;
  time: TimeSelection;
  place: PlaceSelection;
}) {
  const user = await requireSession();
  const { bookingType, time, place } = input;

  if (bookingType === "scheduled-fullroom") {
    // No online booking — the UI handles this as a contact request.
    throw new Error("FULL_ROOM_NOT_BOOKABLE_ONLINE");
  }

  // ---- Walk-in: open session, charged at checkout (cap 4h) ----
  if (bookingType === "walkin-coworking" || bookingType === "walkin-meeting") {
    const facilityType: BookingFacilityType =
      bookingType === "walkin-coworking" ? "WALKIN_COWORKING" : "WALKIN_MEETING";
    return createBooking({
      orgId: user.orgId,
      userId: user.id,
      facilityType,
      facilityId: null,
      facilityName:
        bookingType === "walkin-coworking"
          ? "Walk-in Coworking"
          : "Walk-in Meeting Room",
      // startAt defaults to now inside createBooking; no endAt (open duration).
      ratePerHourRupiah:
        bookingType === "walkin-coworking"
          ? WALKIN_COWORKING_RATE
          : WALKIN_MEETING_RATE,
    });
  }

  // ---- Scheduled: createBooking resolves the facility by (orgId, type, name)
  //      server-side and reads the rate from the row. The client's place.id is
  //      a UI slug and is never trusted as a DB id. ----
  const facilityType: BookingFacilityType =
    bookingType === "scheduled-coworking" ? "COWORKING_SEAT" : "MEETING_ROOM";

  if (!time.date || !time.startTime || time.durationHours <= 0) {
    throw new Error("SCHEDULED_REQUIRES_TIME");
  }

  const startAt = parseStartAt(time.date, time.startTime);
  const endAt = new Date(startAt.getTime() + time.durationHours * 3_600_000);

  return createBooking({
    orgId: user.orgId,
    userId: user.id,
    facilityType,
    facilityId: null, // resolved by name within the org, server-side
    facilityName: place.label,
    startAt,
    endAt,
    // ratePerHourRupiah is ignored for scheduled (read from the facility row).
    ratePerHourRupiah: 0,
  });
}
