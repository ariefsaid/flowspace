/**
 * Server-side discount-eligibility seam (ADR-0011).
 * Dormant: always returns false until the booking domain exists.
 * When booking lands, this function consults the bookings repository to check
 * for an active session — no other code needs to change.
 */
import type { Role } from "@/lib/db/enums";

type SessionUser = { id: string; role: Role; orgId: string } | null;

/** ADR-0011: server-resolved. Dormant (always false) until the booking domain exists. */
export async function resolveDiscountEligibility(user: SessionUser): Promise<boolean> {
  void user; // intentionally unused — seam wired when booking domain lands (ADR-0011)
  return false;
}
