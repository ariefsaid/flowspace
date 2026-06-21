/**
 * Server-side discount-eligibility seam (ADR-0011, OBS-070).
 * A MEMBER with an active coworking session (an ACTIVE booking) gets the 5%
 * cafe discount; everyone else (guests, members without a live session, staff)
 * pays standard. Resolved server-side — never trusted from the client.
 */
import { getActiveBooking } from "@/lib/db/bookings";
import type { Role } from "@/lib/db/enums";

type SessionUser = { id: string; role: Role; orgId: string } | null;

/** ADR-0011 / OBS-070: server-resolved active-session member discount. */
export async function resolveDiscountEligibility(user: SessionUser): Promise<boolean> {
  if (!user || user.role !== "MEMBER") return false;
  return (await getActiveBooking(user.orgId, user.id)) !== null;
}
