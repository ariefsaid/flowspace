"use server";
/**
 * Admin pending-payment actions (I-021 admin surface, extended I-040).
 *
 * approvePaymentAction: ADMIN-only (SoD). Settles a PENDING scheduled
 * booking's offline cashier payment — PENDING→CONFIRMED, paymentStatus
 * WAITING_CASHIER→PAID_CASHIER, and settles the linked BOOKING ledger row to
 * COMPLETED atomically.
 *
 * approveAndStartWalkInAction: ADMIN-only (SoD). Starts a PENDING walk-in —
 * PENDING→ACTIVE, `start_at`=approval time, `end_at` stays null (FR-854,
 * fixes the ORIG +24h-placeholder defect, OBS-841). The pending-list UI
 * currently calls only `approvePaymentAction` for every row (PendingClient.tsx);
 * splitting the two affordances by `bookingMode` is Chunk 3 (plan Phase 9,
 * Task 30).
 *
 * [SEC] orgId is always resolved from the server session; the booking id is the
 * only client input and is resolved within the caller's org (cross-org →
 * NOT_FOUND, no write). The role gate here is the authority; lib/admin/authz
 * exposes the same gate for integration tests.
 */
import { requireSession } from "@/lib/auth/session";
import { approvePayment, approveAndStartWalkIn } from "@/lib/db/bookings";

/** ADMIN-only (SoD): approve an offline cashier payment for a scheduled booking. */
export async function approvePaymentAction(bookingId: string) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return approvePayment(user.orgId, bookingId);
}

/** ADMIN-only (SoD): start a PENDING walk-in (cashier approval). */
export async function approveAndStartWalkInAction(bookingId: string) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return approveAndStartWalkIn(user.orgId, bookingId);
}
