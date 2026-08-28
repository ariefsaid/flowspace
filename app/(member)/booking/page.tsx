/**
 * Member booking page — server component (I-021, rewired I-040 Chunk 3).
 * Resolves the member's real tier-discount percentages + time-credit balance
 * server-side and passes them to the BookingClient wizard. The floor plan
 * itself is loaded on-demand (getFloorPlanAction, per-step, server-driven —
 * OBS-836 fix) rather than preloaded here, since availability depends on the
 * date/time the member picks in step 2. The orgId is always resolved from the
 * session — the client never supplies it.
 *
 * FR-### / AC-801/842.
 */
import { requireSession } from "@/lib/auth/session";
import { findById } from "@/lib/db/users";
import { getTierDiscounts } from "@/lib/db/tier-config";
import { BookingClient } from "./BookingClient";

export default async function BookingPage() {
  const user = await requireSession();
  const profile = await findById(user.orgId, user.id);
  const tier = profile?.membershipTier ?? "REGULAR";
  const discounts = await getTierDiscounts(user.orgId, tier);

  return (
    <BookingClient
      discounts={{
        coworkingDiscountPct: discounts.coworkingDiscountPct,
        meetingDiscountPct: discounts.meetingDiscountPct,
      }}
      timeCredits={profile?.timeCredits ?? 0}
    />
  );
}
