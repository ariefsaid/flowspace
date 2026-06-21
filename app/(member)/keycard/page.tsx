/**
 * Member keycard page — server component (I-024).
 * Reads the member's active booking (getActiveBooking, org-scoped) and renders
 * the empty state or the digital key card. The QR token is server-signed and
 * window-rotating (lib/keycard/token) — the client only triggers rotation, it
 * never signs the token. [SEC]
 *
 * OBS-090 / AC-###.
 */
import { requireSession } from "@/lib/auth/session";
import { getActiveBooking } from "@/lib/db/bookings";
import { generateKeycardToken } from "@/lib/keycard/token";
import { KeycardClient, type ActiveBookingView } from "./KeycardClient";

export default async function KeycardPage() {
  const user = await requireSession();
  const booking = await getActiveBooking(user.orgId, user.id);

  if (!booking) {
    return <KeycardClient booking={null} token="" />;
  }

  const view: ActiveBookingView = {
    id: booking.id,
    facilityName: booking.facilityName,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt ? booking.endAt.toISOString() : null,
    durationHours: booking.durationHours,
  };

  // ponytail: token derived per-render for the current 30s window; the client
  // rotates it by re-running this RSC (router.refresh) — no table, no session.
  const token = generateKeycardToken(booking.id);

  return <KeycardClient booking={view} token={token} />;
}
