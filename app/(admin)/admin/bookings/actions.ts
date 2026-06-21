"use server";
/**
 * Admin booking-management actions (I-021 admin surface).
 *
 * completeBookingAction: ADMIN-only (SoD). Force-completes an ACTIVE booking —
 * for a walk-in this computes the charge (ceil hours, cap 4h, DB rate × hours)
 * and flips status to COMPLETED. For a scheduled booking it just closes it out.
 *
 * [SEC] orgId is always resolved from the server session; the booking id is the
 * only client input and is resolved within the caller's org (cross-org →
 * NOT_FOUND, no write). Amounts are server-derived (completeBooking reads the
 * DB rate row); no client amount is trusted.
 */
import { requireSession } from "@/lib/auth/session";
import { completeBooking } from "@/lib/db/bookings";

/** ADMIN-only (SoD): force-complete an active booking (computes walk-in charge). */
export async function completeBookingAction(bookingId: string) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return completeBooking(user.orgId, bookingId);
}
