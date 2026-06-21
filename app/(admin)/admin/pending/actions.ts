"use server";
/**
 * Admin pending-payment actions (I-021 admin surface).
 *
 * approvePaymentAction: ADMIN-only (SoD). Records that the cashier accepted an
 * offline payment for a WAITING_CASHIER booking — sets paymentStatus PAID_CASHIER
 * and settles the linked BOOKING ledger row to COMPLETED atomically.
 *
 * [SEC] orgId is always resolved from the server session; the booking id is the
 * only client input and is resolved within the caller's org (cross-org →
 * NOT_FOUND, no write). The role gate here is the authority; lib/admin/authz
 * exposes the same gate for integration tests.
 */
import { requireSession } from "@/lib/auth/session";
import { approvePayment } from "@/lib/db/bookings";

/** ADMIN-only (SoD): approve an offline cashier payment for a booking. */
export async function approvePaymentAction(bookingId: string) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return approvePayment(user.orgId, bookingId);
}
