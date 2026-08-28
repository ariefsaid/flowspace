/**
 * Member dashboard — server component (I-021 read model).
 *
 * Reads the signed-in member's balances, active booking, and recent booking
 * history (all org+user scoped from the session, never client ids) and passes
 * them to the pixel-identical DashboardClient leaf. The QR access token is
 * server-signed (lib/keycard/token) — the client only rotates it. [SEC]
 *
 * OBS-050/051/056/090.
 */
import { requireSession } from "@/lib/auth/session";
import { getActiveBooking, listBookingsByUser } from "@/lib/db/bookings";
import { findById } from "@/lib/db/users";
import { generateKeycardToken } from "@/lib/keycard/token";
import { WALKIN_MAX_HOURS, isWalkin } from "@/lib/booking/walkin";
import {
  DashboardClient,
  type ActiveSessionView,
  type BookingPreviewView,
  type WifiView,
} from "./DashboardClient";

// ponytail: SIMULATED seeded WiFi credentials. The UniFi integration is a
// deferred owner-gated issue (rules: "WiFi voucher SIMULATED"). Same for every
// member; not org/user-scoped — it is a placeholder, not real data.
const SIMULATED_WIFI: WifiView = {
  ssid: "FlowSpace-Guest",
  voucher: "6070-2020-85",
};

export default async function DashboardPage() {
  const user = await requireSession();
  const [profile, activeBooking, recentBookings] = await Promise.all([
    findById(user.orgId, user.id),
    getActiveBooking(user.orgId, user.id),
    listBookingsByUser(user.orgId, user.id, 5),
  ]);

  // I-040: the session panel covers BOTH lifecycles — an open walk-in
  // (endAt null, running cost derived client-side from startAt) AND a
  // scheduled ACTIVE booking (fixed end — countdown/extension/overtime).
  let activeSession: ActiveSessionView | null = null;
  if (activeBooking) {
    activeSession = {
      bookingId: activeBooking.id,
      facilityName: activeBooking.facilityName,
      bookingMode: activeBooking.bookingMode,
      startAt: activeBooking.startAt.toISOString(),
      endAt: activeBooking.endAt ? activeBooking.endAt.toISOString() : null,
      ratePerHourRupiah: activeBooking.ratePerHourRupiah,
      maxHours: isWalkin(activeBooking.facilityType) ? WALKIN_MAX_HOURS : 0,
    };
  }

  const preview: BookingPreviewView[] = recentBookings.map((b) => ({
    id: b.id,
    facility: b.facilityName,
    start: b.startAt.toISOString(),
    status: b.status,
  }));

  // ponytail: the dashboard QR is a standing member access card (shown
  // unconditionally, unlike the booking-scoped /keycard page), so the signed
  // subject is the member's app_users id. Same HMAC machinery as /keycard. [SEC]
  const qrToken = generateKeycardToken(user.id);

  return (
    <DashboardClient
      firstName={user.name.split(" ")[0]}
      hasSession={activeSession !== null}
      timeCredits={profile?.timeCredits ?? 0}
      printBalance={profile?.printBalance ?? 0}
      tier={profile?.membershipTier ?? "REGULAR"}
      qrToken={qrToken}
      activeSession={activeSession}
      recentBookings={preview}
      wifi={SIMULATED_WIFI}
    />
  );
}
