/**
 * Server-side authorization helpers for admin booking/payment mutations
 * (I-021 admin surfaces). SoD: only ADMIN may approve an offline cashier
 * payment or force-complete an active session. The role gate is enforced
 * again inside each "use server" action (defence-in-depth — the action is the
 * real gate; this module exposes the same gate as a pure function + a test
 * seam so integration tests can prove the no-write behaviour for non-admins).
 */
import type { Role } from "@/lib/db/enums";
import { approvePayment, completeBooking } from "@/lib/db/bookings";

/** Returns true if the role is allowed to approve payments / complete sessions. */
export function canAdminBookings(role: Role): boolean {
  return role === "ADMIN";
}

/**
 * Test seam: performs the same ADMIN role gate + approvePayment without needing
 * a live Supabase session. Throws FORBIDDEN before any DB write for non-admins.
 * Used by integration tests for the SoD no-write proof.
 */
export async function approvePaymentAsActor(
  actor: { id: string; role: Role; orgId: string },
  bookingId: string,
) {
  if (!canAdminBookings(actor.role)) {
    throw new Error("FORBIDDEN");
  }
  return approvePayment(actor.orgId, bookingId);
}

/**
 * Test seam: same ADMIN role gate + completeBooking without a live session.
 * Throws FORBIDDEN before any DB write for non-admins.
 */
export async function completeBookingAsActor(
  actor: { id: string; role: Role; orgId: string },
  bookingId: string,
) {
  if (!canAdminBookings(actor.role)) {
    throw new Error("FORBIDDEN");
  }
  return completeBooking(actor.orgId, bookingId);
}
