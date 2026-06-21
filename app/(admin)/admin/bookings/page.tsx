/**
 * Admin booking-management page — server component.
 * Reads all org-scoped bookings (newest first) and attaches each booking's
 * member profile (name/email/tier) in a single org-scoped read. The client
 * leaf's "Selesaikan Sesi & Bayar" CTA on an active walk-in calls
 * completeBookingAction (ADMIN-only SoD) which computes the charge and flips
 * the booking to COMPLETED.
 *
 * ponytail: an active walk-in has endAt null — we fall back to startAt so the
 * table's time formatter renders without crashing (active rows render as cards,
 * not table rows, so this only guards the rare ACTIVE-in-table edge).
 */
import { requireSession } from "@/lib/auth/session";
import { listBookings } from "@/lib/db/bookings";
import { findProfilesByIds } from "@/lib/db/users";
import { BookingsClient, type AdminBookingView } from "./BookingsClient";

export default async function AdminBookingsPage() {
  const user = await requireSession();
  const orgId = user.orgId;

  const rows = await listBookings(orgId);

  // Attach member profiles in one org-scoped read (cross-org ids never match).
  const memberIds = [...new Set(rows.map((b) => b.userId))];
  const profiles = await findProfilesByIds(orgId, memberIds);
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const bookings: AdminBookingView[] = rows.map((b) => {
    const profile = profileMap.get(b.userId);
    return {
      id: b.id,
      facility: b.facilityName,
      facilityType: b.facilityType,
      start: b.startAt.toISOString(),
      end: (b.endAt ?? b.startAt).toISOString(),
      durationHours: b.durationHours ?? 0,
      status: b.status,
      payment: b.paymentStatus,
      amount: b.amountRupiah,
      member: profile
        ? {
            name: profile.name,
            email: profile.email,
            tier: profile.membershipTier,
          }
        : null,
    };
  });

  return <BookingsClient bookings={bookings} />;
}
