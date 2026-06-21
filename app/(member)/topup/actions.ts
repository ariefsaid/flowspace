"use server";
/**
 * Top-up server actions (I-020) — package purchase + print top-up.
 *
 * The client sends only the chosen `packageId` / `pages`. `orgId` and `userId`
 * are always resolved server-side from the session (ADR-0004); the client never
 * supplies them. Amounts are computed server-side by the repository ([SEC]).
 */
import { requireSession } from "@/lib/auth/session";
import { purchasePackage, topUpPrint } from "@/lib/db/packages";

/**
 * Purchase a time-credit package for the signed-in member.
 * Simulated payment → the ledger row is COMPLETED directly (verticals-rules.md).
 */
export async function purchasePackageAction(packageId: string) {
  const user = await requireSession();
  return purchasePackage({
    orgId: user.orgId,
    userId: user.id,
    packageId,
  });
}

/**
 * Top up the signed-in member's print balance by `pages` pages.
 * Simulated payment → COMPLETED. `pages` is re-validated server-side.
 */
export async function topUpPrintAction(pages: number) {
  const user = await requireSession();
  return topUpPrint({
    orgId: user.orgId,
    userId: user.id,
    pages,
  });
}
