"use server";
/**
 * Admin booking-management actions (I-021, rewired I-040).
 *
 * checkoutBookingAction: ADMIN-only (SoD). Checks out an ACTIVE booking —
 * recomputes billed hours (walk-in: elapsed ceil, capped; scheduled: booked
 * duration) and the current tier discount, settles payment (cash/qris →
 * PAID_CASHIER; time_credits → FIFO-debited, PAID_ONLINE), and flips status
 * to COMPLETED. Supersedes `completeBookingAction` (I-021), which force-
 * completed without a payment-method choice or billing recomputation
 * (OBS-839 — a defect this closes).
 *
 * [SEC] orgId is always resolved from the server session; the booking id is the
 * only client input and is resolved within the caller's org (cross-org →
 * NOT_FOUND, no write). Amounts are server-derived (checkoutBooking recomputes
 * from the DB rate row + current tier config); no client amount is trusted.
 */
import { requireSession } from "@/lib/auth/session";
import { checkoutBooking, type CheckoutPaymentMethod } from "@/lib/db/bookings";

/** ADMIN-only (SoD): check out an ACTIVE booking with the chosen payment method. */
export async function checkoutBookingAction(bookingId: string, paymentMethod: CheckoutPaymentMethod) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return checkoutBooking(user.orgId, bookingId, paymentMethod);
}

/**
 * ponytail: transitional cash-only shim preserving the pre-I-040
 * `completeBookingAction(bookingId)` call shape that `BookingsClient.tsx`'s
 * "Selesaikan Sesi & Bayar" button still calls. Chunk 3 (plan Phase 9, Task
 * 30) replaces this call site with a real cash/QRIS/credits chooser wired to
 * `checkoutBookingAction` directly — remove this shim then.
 */
export async function completeBookingAction(bookingId: string) {
  return checkoutBookingAction(bookingId, "cash");
}
