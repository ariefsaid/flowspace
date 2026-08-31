"use server";
/**
 * Admin booking-management actions (I-021, rewired I-040).
 *
 * checkoutBookingAction: ADMIN-only (SoD). Checks out an ACTIVE booking —
 * recomputes billed hours (walk-in: elapsed ceil, capped; scheduled: booked
 * duration) and the current tier discount, settles payment (cash/qris →
 * PAID_CASHIER; time_credits → FIFO-debited, PAID_ONLINE), and flips status
 * to COMPLETED. `BookingsClient.tsx`'s checkout chooser calls this directly
 * with the admin's chosen method — the transitional cash-only
 * `completeBookingAction` shim (I-021/Chunk-2) is removed (OBS-839 fix).
 *
 * [SEC] orgId is always resolved from the server session; the booking id is the
 * only client input and is resolved within the caller's org (cross-org →
 * NOT_FOUND, no write). Amounts are server-derived (checkoutBooking recomputes
 * from the DB rate row + current tier config); no client amount is trusted.
 */
import { requireSession } from "@/lib/auth/session";
import {
  checkoutBooking,
  cancelBooking,
  activateConfirmedBooking,
  createBooking,
  type CheckoutPaymentMethod,
  type BookingPaymentChoice,
} from "@/lib/db/bookings";
import type { Booking } from "@/lib/db/schema";
import type { BookingFacilityType } from "@/lib/db/enums";

/** ADMIN-only (SoD): check out an ACTIVE booking with the chosen payment method. */
export async function checkoutBookingAction(bookingId: string, paymentMethod: CheckoutPaymentMethod) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return checkoutBooking(user.orgId, bookingId, paymentMethod);
}

/** ADMIN-only: cancels a PENDING/CONFIRMED/ACTIVE booking within the caller's org. */
export async function cancelBookingAction(bookingId: string): Promise<Booking> {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return cancelBooking(user.orgId, bookingId);
}

/**
 * ADMIN-only: manual "Aktifkan Sekarang" — activates a paid CONFIRMED
 * booking immediately, the fallback for when the cron sweep misfires or
 * hasn't run yet.
 */
export async function activateBookingAction(bookingId: string): Promise<Booking> {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return activateConfirmedBooking(user.orgId, bookingId);
}

/**
 * ADMIN-only [MONEY]: creates a booking on behalf of a member (e.g. a
 * phone/counter booking taken by staff). Reuses `createBooking`, which
 * re-resolves the target user WITHIN the admin's session org (rejecting a
 * cross-org `userId` with `USER_NOT_FOUND`, no write) and re-derives the
 * facility/rate/tier-discount from the DB — never a client-supplied amount.
 * No client-side policy checkbox exists for this admin-mediated flow, so
 * `acceptedPolicy` is always recorded true (an audit-trail field only, same
 * as every other create path).
 */
export async function createBookingAsAdminAction(input: {
  userId: string;
  facilityType: BookingFacilityType;
  facilityId?: string | null;
  facilityName: string;
  startAt?: Date;
  endAt?: Date;
  paymentMethod: BookingPaymentChoice;
}): Promise<Booking> {
  const admin = await requireSession();
  if (admin.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return createBooking({
    orgId: admin.orgId,
    userId: input.userId,
    tier: "REGULAR", // [SEC] IGNORED by createBooking — the real tier is resolved from the DB row
    facilityType: input.facilityType,
    facilityId: input.facilityId,
    facilityName: input.facilityName,
    startAt: input.startAt,
    endAt: input.endAt,
    paymentMethod: input.paymentMethod,
    acceptedPolicy: true,
  });
}
