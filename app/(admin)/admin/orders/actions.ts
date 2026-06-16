"use server";
/**
 * Admin order-management actions (I-022, Phase D).
 *
 * setOrderStatusAction: admin free-set any CafeOrderStatus (not forward-only).
 * Enforces ADMIN role server-side (FR-124). orgId from session only.
 */
import { requireSession } from "@/lib/auth/session";
import { setOrderStatus } from "@/lib/db/cafe";
import type { CafeOrderStatus } from "@/lib/cafe/types";

/**
 * Admin-only: set an order to any CafeOrderStatus (no forward-only constraint).
 * Throws FORBIDDEN if the caller is not ADMIN.
 * FR-124 / enforces FR-122 for admin surface.
 */
export async function setOrderStatusAction(orderId: string, status: CafeOrderStatus) {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return setOrderStatus(user.orgId, orderId, status);
}
