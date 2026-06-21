/**
 * Admin pending-payments page — server component.
 * Lists org-scoped WAITING_CASHIER bookings (excludes CANCELLED) and attaches
 * the member display name. The client leaf's Approve button calls
 * approvePaymentAction (ADMIN-only SoD) which flips paymentStatus to PAID_CASHIER
 * and settles the linked ledger row.
 *
 * ponytail: phone is not on app_users ("" → omitted by the existing conditional
 * UI); an active walk-in has endAt null — we fall back to startAt so the
 * date-range formatter renders same-day without crashing (most pending rows are
 * completed walk-ins awaiting payment, which do carry endAt).
 */
import { requireSession } from "@/lib/auth/session";
import { listPendingBookings } from "@/lib/db/bookings";
import { findProfilesByIds } from "@/lib/db/users";
import { PendingClient, type PendingItem } from "./PendingClient";

export default async function AdminPendingPage() {
  const user = await requireSession();
  const orgId = user.orgId;

  const rows = await listPendingBookings(orgId);

  // Attach member names in one org-scoped read (cross-org ids never match).
  const memberIds = [...new Set(rows.map((b) => b.userId))];
  const profiles = await findProfilesByIds(orgId, memberIds);
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const items: PendingItem[] = rows.map((b) => {
    const profile = profileMap.get(b.userId);
    return {
      id: b.id,
      facility: b.facilityName,
      start: b.startAt.toISOString(),
      end: (b.endAt ?? b.startAt).toISOString(),
      durationHours: b.durationHours ?? 0,
      amount: b.amountRupiah,
      member: profile ? { name: profile.name, phone: "" } : null,
    };
  });

  return <PendingClient items={items} />;
}
