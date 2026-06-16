/**
 * Server-side authorization helpers for the cafe domain (I-022, Phase D).
 * canMutateOrderStatus enforces FR-122: only BARISTA/ADMIN may advance status.
 * advanceOrderStatusAsActor is a thin test seam that applies the same gate.
 */
import type { Role } from "@prisma/client";
import { advanceOrderStatus } from "@/lib/db/cafe";

/** Returns true if the role is allowed to advance/set order status. */
export function canMutateOrderStatus(role: Role): boolean {
  return role === "BARISTA" || role === "ADMIN";
}

/**
 * Test seam: performs the same role gate + advanceOrderStatus without needing
 * a live NextAuth session. Used by integration tests for AC-123.
 */
export async function advanceOrderStatusAsActor(
  actor: { id: string; role: Role; orgId: string },
  orderId: string,
) {
  if (!canMutateOrderStatus(actor.role)) {
    throw new Error("FORBIDDEN");
  }
  return advanceOrderStatus(actor.orgId, orderId);
}
