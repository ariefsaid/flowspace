"use server";
/**
 * Booking server action (I-021, signature updated I-040). The orgId/userId/
 * tier are always resolved server-side from the session/profile; the client
 * never supplies them (ADR-0004).
 *
 * [SEC] Money path:
 * - The scheduled facility + its rate are resolved WITHIN the org from the DB
 *   (createBooking re-validates and reads the rate from the facility row). The
 *   client only sends the selected facility *label*; never an id/price it
 *   controls.
 * - Walk-in rates are server-side constants inside createBooking
 *   (`lib/booking/catalog.ts`'s `WALKIN_RATES`) — never client-supplied.
 * - durationHours is re-derived server-side from the start/end timestamps
 *   inside createBooking — never trusted from the client.
 *
 * ponytail: the wizard has no payment-method picker yet (that UI lands with
 * I-040 Chunk 3, plan Phase 7); every scheduled/walk-in create here defaults
 * to `paymentMethod: "cashier"` (the safe default — no credits/gateway charge
 * without an explicit member choice) until the picker is wired.
 */
import { requireSession } from "@/lib/auth/session";
import { createBooking, type BookingPaymentChoice } from "@/lib/db/bookings";
import { findById } from "@/lib/db/users";
import type { BookingFacilityType } from "@/lib/db/enums";
import type { BookingType } from "@/components/member/booking/Step1Type";
import type { TimeSelection } from "@/components/member/booking/Step2Time";
import type { PlaceSelection } from "@/components/member/booking/Step3Place";

// ponytail: transitional default until the Chunk-3 payment-method picker lands.
const DEFAULT_PAYMENT_METHOD: BookingPaymentChoice = "cashier";

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
  const profile = await findById(user.orgId, user.id);
  const tier = profile?.membershipTier ?? "REGULAR";
  const { bookingType, time, place } = input;

  // ---- Walk-in: open session, charged at checkout (cap 4h) ----
  if (bookingType === "walkin-coworking" || bookingType === "walkin-meeting") {
    const facilityType: BookingFacilityType =
      bookingType === "walkin-coworking" ? "WALKIN_COWORKING" : "WALKIN_MEETING";
    return createBooking({
      orgId: user.orgId,
      userId: user.id,
      tier,
      facilityType,
      facilityId: null,
      facilityName:
        bookingType === "walkin-coworking"
          ? "Walk-in Coworking"
          : "Walk-in Meeting Room",
      // startAt defaults to now inside createBooking; no endAt (open duration).
      paymentMethod: DEFAULT_PAYMENT_METHOD,
    });
  }

  // ---- Scheduled (COWORKING_SEAT / MEETING_ROOM / FULL_ROOM): createBooking
  //      resolves the facility by (orgId, type, name) server-side and reads
  //      the rate from the row. The client's place.id is a UI slug and is
  //      never trusted as a DB id. FULL_ROOM is online-bookable (OBS-812). ----
  const facilityType: BookingFacilityType =
    bookingType === "scheduled-coworking"
      ? "COWORKING_SEAT"
      : bookingType === "scheduled-fullroom"
        ? "FULL_ROOM"
        : "MEETING_ROOM";

  if (!time.date || !time.startTime || time.durationHours <= 0) {
    throw new Error("SCHEDULED_REQUIRES_TIME");
  }

  const startAt = parseStartAt(time.date, time.startTime);
  const endAt = new Date(startAt.getTime() + time.durationHours * 3_600_000);

  return createBooking({
    orgId: user.orgId,
    userId: user.id,
    tier,
    facilityType,
    facilityId: null, // resolved by name within the org, server-side
    facilityName: place.label,
    startAt,
    endAt,
    paymentMethod: DEFAULT_PAYMENT_METHOD,
  });
}
