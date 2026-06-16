"use server";
/**
 * Cafe server actions — public-facing order placement (I-022, Phase D).
 *
 * placeOrder handles both member and guest paths. The orgId is always
 * resolved server-side; clients never supply it (ADR-0004).
 * Totals are computed server-side by createOrder (FR-111).
 */
import { getSessionUser } from "@/lib/auth/session";
import { resolveDiscountEligibility } from "@/lib/cafe/eligibility";
import { createOrder } from "@/lib/db/cafe";
import { db } from "@/lib/db/drizzle";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { OrderLineInput } from "@/lib/cafe/types";

/** Resolve the single venue's orgId by slug for guest orders. */
async function resolveGuestOrgId(slug: string): Promise<string> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) throw new Error("ORG_NOT_FOUND");
  return org.id;
}

/**
 * Place an order for a member (authenticated) or guest (no session).
 *
 * Member path: orgId from session, customerUserId from session, discount via
 * resolveDiscountEligibility (dormant false per ADR-0011).
 * Guest path: orgId resolved server-side by SEED_ORG_SLUG env, captures
 * guestName (required, non-empty), no discount.
 *
 * FR-111, FR-112, FR-113, FR-114 / AC-112, AC-113, AC-114
 */
export async function placeOrder(input: {
  lines: OrderLineInput[];
  guestName?: string;
}) {
  const user = await getSessionUser();

  if (user) {
    // Member / authenticated path
    const discountEligible = await resolveDiscountEligibility(user);
    return createOrder({
      orgId: user.orgId,
      customerUserId: user.id,
      guestName: null,
      lines: input.lines,
      discountEligible,
    });
  }

  // Guest path — require a non-empty name (capped to a sane length; it is
  // client-supplied and rendered on the KDS — React escapes it, but bound the
  // stored/rendered size).
  const guestName = (input.guestName ?? "").trim().slice(0, 60);
  if (!guestName) throw new Error("GUEST_NAME_REQUIRED");

  const slug = process.env.SEED_ORG_SLUG ?? "flowspace";
  const orgId = await resolveGuestOrgId(slug);

  return createOrder({
    orgId,
    customerUserId: null,
    guestName,
    lines: input.lines,
    discountEligible: false,
  });
}
