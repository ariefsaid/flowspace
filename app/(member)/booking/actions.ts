"use server";
/**
 * Booking server actions (I-021, rewired I-040 booking parity Chunk 3).
 * The orgId/userId/tier are always resolved server-side from the
 * session/profile; the client never supplies them (ADR-0004).
 *
 * [SEC] Money path:
 * - The scheduled facility is resolved WITHIN the org from the DB by its real
 *   `facilityId` (sourced from the server-driven floor plan — never a
 *   client-typed name/rate). createBooking re-validates the row + reads the
 *   rate from it.
 * - A walk-in's rate is a server-side constant inside createBooking
 *   (`lib/booking/catalog.ts`'s `WALKIN_RATES`) — never client-supplied.
 * - A walk-in's paymentMethod is FORCED to "cashier" server-side regardless
 *   of client input (OBS-808/815 — a walk-in is always pay-at-cashier; the
 *   client never even renders a picker for it, but the server never trusts
 *   that either).
 * - durationHours is re-derived server-side from the start/end timestamps
 *   inside createBooking — never trusted from the client.
 */
import { requireSession } from "@/lib/auth/session";
import {
  createBooking,
  facilitiesAvailableInWindow,
  getFullRoomAvailability,
  listFacilities,
  type BookingPaymentChoice,
} from "@/lib/db/bookings";
import { findById } from "@/lib/db/users";
import type { Facility } from "@/lib/db/schema";
import type { BookingType } from "@/components/member/booking/Step1Type";
import type { TimeSelection } from "@/components/member/booking/Step2Time";
import type { FacilitySeat } from "@/components/member/booking/FloorPlan";
import type { CreatedBookingResult } from "@/components/member/booking/Step4Confirm";
import {
  wizardTypeToFacilityType,
  wizardTypeToCatalogFacilityType,
  isWalkinBookingType,
} from "@/lib/booking/wizard-type";

/** Local-time "YYYY-MM-DD HH:MM" → Date. ponytail: no tz math; venue is id-ID. */
function parseStartAt(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}:00`);
}

function toSeat(f: Facility, status: "available" | "occupied"): FacilitySeat {
  return {
    id: f.id,
    label: f.name,
    seatLabel: f.seatLabel,
    zone: f.zone,
    status,
    ratePerHourRupiah: f.ratePerHourRupiah,
  };
}

/**
 * Server-driven floor plan (OBS-836 fix): reads the org's real catalog rows
 * for the wizard's chosen type + the SAME availability read model the
 * server's create path re-checks (facilitiesAvailableInWindow /
 * getFullRoomAvailability, lib/db/bookings.ts) — never a hardcoded seat map.
 *
 * A walk-in's window is "right now" (a walk-in always starts at cashier
 * approval time regardless of the picked date, OBS-808) — a point-in-time
 * occupancy check, not the picked window.
 */
export async function getFloorPlanAction(input: {
  bookingType: BookingType;
  time: TimeSelection;
}): Promise<FacilitySeat[]> {
  const user = await requireSession();
  const catalogType = wizardTypeToCatalogFacilityType(input.bookingType);
  const walkin = isWalkinBookingType(input.bookingType);

  let start: Date;
  let end: Date;
  if (walkin || !input.time.date || !input.time.startTime) {
    start = new Date();
    end = start;
  } else {
    start = parseStartAt(input.time.date, input.time.startTime);
    end = new Date(start.getTime() + Math.max(input.time.durationHours, 1) * 3_600_000);
  }

  if (catalogType === "FULL_ROOM") {
    const day = start.toISOString().slice(0, 10);
    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
    const [rows, isAvailable] = await Promise.all([
      listFacilities(user.orgId, "FULL_ROOM"),
      getFullRoomAvailability(user.orgId, dayStart, dayEnd),
    ]);
    return rows.map((f) => toSeat(f, isAvailable ? "available" : "occupied"));
  }

  const [rows, availableRows] = await Promise.all([
    listFacilities(user.orgId, catalogType),
    facilitiesAvailableInWindow(user.orgId, start, end),
  ]);
  const availableIds = new Set(availableRows.map((f) => f.id));
  return rows.map((f) => toSeat(f, availableIds.has(f.id) ? "available" : "occupied"));
}

export async function createBookingAction(input: {
  bookingType: BookingType;
  time: TimeSelection;
  place: FacilitySeat;
  paymentMethod: BookingPaymentChoice;
}): Promise<CreatedBookingResult> {
  const user = await requireSession();
  const profile = await findById(user.orgId, user.id);
  const tier = profile?.membershipTier ?? "REGULAR";
  const { bookingType, time, place } = input;
  const facilityType = wizardTypeToFacilityType(bookingType);

  // ---- Walk-in: open session, charged at checkout (cap 4h). Always cashier. ----
  if (isWalkinBookingType(bookingType)) {
    const booking = await createBooking({
      orgId: user.orgId,
      userId: user.id,
      tier,
      facilityType,
      facilityId: null,
      facilityName:
        bookingType === "walkin-coworking" ? "Walk-in Coworking" : "Walk-in Meeting Room",
      // startAt defaults to now inside createBooking; no endAt (open duration).
      paymentMethod: "cashier",
    });
    return {
      id: booking.id,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      amountRupiah: booking.amountRupiah,
      baseAmountRupiah: booking.baseAmountRupiah,
      discountRupiah: booking.discountRupiah,
      facilityName: booking.facilityName,
    };
  }

  // ---- Scheduled (COWORKING_SEAT / MEETING_ROOM / FULL_ROOM): the real
  //      facility id comes from the server-driven floor plan selection —
  //      createBooking re-resolves it within the org and reads the rate from
  //      the row. FULL_ROOM is online-bookable (OBS-812). ----
  if (!time.date || !time.startTime || time.durationHours <= 0) {
    throw new Error("SCHEDULED_REQUIRES_TIME");
  }

  const startAt = parseStartAt(time.date, time.startTime);
  const endAt = new Date(startAt.getTime() + time.durationHours * 3_600_000);

  const booking = await createBooking({
    orgId: user.orgId,
    userId: user.id,
    tier,
    facilityType,
    facilityId: place.id,
    facilityName: place.label,
    startAt,
    endAt,
    paymentMethod: input.paymentMethod,
  });
  return {
    id: booking.id,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    amountRupiah: booking.amountRupiah,
    baseAmountRupiah: booking.baseAmountRupiah,
    discountRupiah: booking.discountRupiah,
    facilityName: booking.facilityName,
  };
}
