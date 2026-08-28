"use server";
/**
 * Member dashboard actions (I-040 Phase 8).
 *
 * extendBookingAction: extends the member's own ACTIVE scheduled booking
 * (OBS-818/822). [SEC] orgId is always resolved server-side from the
 * session. `extendBooking(orgId, id, ...)` is org-scoped ONLY (no userId
 * param — it also serves the admin surface), so this action verifies
 * OWNERSHIP itself before calling it: the target id must be the caller's own
 * current active booking (getActiveBooking is user-scoped), otherwise
 * FORBIDDEN before any write. This closes the gap a bare org-scope check
 * would leave (any member in the org could otherwise extend another
 * member's session).
 */
import { requireSession } from "@/lib/auth/session";
import { extendBooking, getActiveBooking } from "@/lib/db/bookings";

export async function extendBookingAction(bookingId: string, extraHours: number) {
  const user = await requireSession();
  const active = await getActiveBooking(user.orgId, user.id);
  if (!active || active.id !== bookingId) {
    throw new Error("FORBIDDEN");
  }
  return extendBooking(user.orgId, bookingId, extraHours);
}
