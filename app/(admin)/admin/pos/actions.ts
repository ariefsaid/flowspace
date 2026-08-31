"use server";
/**
 * Admin POS actions — member lookup + checkout (I-044, FR-725/726).
 *
 * Both actions re-check ADMIN server-side (even though middleware/layout
 * also gate /admin) and resolve orgId/member/eligibility/menu entirely
 * server-side. A client user id, price, subtotal, discount, or option
 * adjustment is never accepted as authority — placePosOrder's input type has
 * no such fields, and createOrder (the shared repository boundary) re-derives
 * the discount from the resolved member's ACTIVE booking + tier config.
 */
import { requireSession } from "@/lib/auth/session";
import { findMemberByEmail } from "@/lib/db/users";
import { getActiveBooking } from "@/lib/db/bookings";
import { getTierDiscounts } from "@/lib/db/tier-config";
import { createOrder } from "@/lib/db/cafe";
import type { CafeOrder } from "@/lib/db/schema";
import type { OrderLineInput } from "@/lib/cafe/types";

export interface PosMemberLookup {
  id: string;
  name: string;
  email: string;
  hasActiveBooking: boolean;
  /** The member's tier `cafeDiscountPct`, 0 when there's no ACTIVE booking (FR-725). */
  cafeDiscountPct: number;
  /** I-047: the ACTIVE booking's facility name, null when there's no ACTIVE booking. */
  activeBookingFacility: string | null;
  /** I-047: the ACTIVE booking's end time (ISO) — null for an open-ended walk-in OR no ACTIVE booking. */
  activeBookingEndAt: string | null;
}

/**
 * ADMIN-only same-org member lookup by email for the POS cashier UI.
 * Returns null for a nonexistent, non-member, or cross-org email — no
 * distinguishing error, so a cashier can never probe another org's user
 * table (NFR-044-02, AC-717).
 */
export async function lookupPosMemberAction(email: string): Promise<PosMemberLookup | null> {
  const cashier = await requireSession();
  if (cashier.role !== "ADMIN") throw new Error("FORBIDDEN");

  const member = await findMemberByEmail(cashier.orgId, email);
  if (!member) return null;

  // I-047: getActiveBooking's own row (not just a boolean) already carries
  // the facility name + end time the cashier UI wants to show — read it once
  // and stop discarding everything but existence.
  const activeBooking = await getActiveBooking(cashier.orgId, member.id);
  const hasActiveBooking = activeBooking !== null;
  const cafeDiscountPct = hasActiveBooking
    ? (await getTierDiscounts(cashier.orgId, member.membershipTier)).cafeDiscountPct
    : 0;

  return {
    id: member.id,
    name: member.name,
    email: member.email,
    hasActiveBooking,
    cafeDiscountPct,
    activeBookingFacility: activeBooking?.facilityName ?? null,
    activeBookingEndAt: activeBooking?.endAt ? activeBooking.endAt.toISOString() : null,
  };
}

/**
 * ADMIN-only POS checkout. `email` is optional — a blank/omitted email
 * creates an unowned (walk-in) order; a supplied email that doesn't resolve
 * to a same-org MEMBER throws `MEMBER_NOT_FOUND` (no order written) rather
 * than silently charging full price under the wrong assumption. Discount
 * eligibility and pricing are both re-derived server-side through the same
 * `createOrder` boundary every other cafe surface uses.
 */
export async function placePosOrder(input: {
  email?: string;
  lines: OrderLineInput[];
  notes?: string;
}): Promise<CafeOrder> {
  const cashier = await requireSession();
  if (cashier.role !== "ADMIN") throw new Error("FORBIDDEN");

  const trimmedEmail = (input.email ?? "").trim();
  let memberId: string | null = null;
  let hasActiveBooking = false;

  if (trimmedEmail) {
    const member = await findMemberByEmail(cashier.orgId, trimmedEmail);
    if (!member) throw new Error("MEMBER_NOT_FOUND");
    memberId = member.id;
    hasActiveBooking = (await getActiveBooking(cashier.orgId, member.id)) !== null;
  }

  return createOrder({
    orgId: cashier.orgId,
    customerUserId: memberId,
    guestName: null,
    lines: input.lines,
    discountEligible: hasActiveBooking,
    notes: input.notes,
  });
}
