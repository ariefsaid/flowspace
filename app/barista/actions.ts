"use server";
/**
 * Barista server actions — order status advancement (I-022, Phase D).
 *
 * Server-side role gate enforced here (FR-121, FR-122 / AC-123).
 * The gate is the enforcement authority; middleware is defense-in-depth only.
 */
import { requireSession } from "@/lib/auth/session";
import { canMutateOrderStatus } from "@/lib/cafe/authz";
import { advanceOrderStatus } from "@/lib/db/cafe";

/**
 * Advance an order one step in the forward lifecycle.
 * Requires BARISTA or ADMIN role; throws FORBIDDEN for MEMBER (FR-122 / AC-123).
 * orgId is always taken from the server session — never from the client.
 */
export async function advanceOrderStatusAction(orderId: string) {
  const user = await requireSession();
  if (!canMutateOrderStatus(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return advanceOrderStatus(user.orgId, orderId);
}
