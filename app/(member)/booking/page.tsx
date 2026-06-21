/**
 * Member booking page — server component (I-021).
 * Reads the org's bookable facilities server-side (listFacilities) and passes
 * them to the BookingClient wizard, which submits createBookingAction. The
 * orgId is always resolved from the session — the client never supplies it.
 *
 * FR-### / AC-###.
 */
import { requireSession } from "@/lib/auth/session";
import { listFacilities } from "@/lib/db/bookings";
import { BookingClient, type FacilityView } from "./BookingClient";

export default async function BookingPage() {
  const user = await requireSession();
  const rows = await listFacilities(user.orgId);

  const facilities: FacilityView[] = rows.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    ratePerHourRupiah: f.ratePerHourRupiah,
    available: f.available,
  }));

  return <BookingClient facilities={facilities} />;
}
