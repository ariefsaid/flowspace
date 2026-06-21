/**
 * Repository: TimeCreditPackage + balance top-ups (I-020).
 *
 * Package purchases credit `app_users.timeCredits`; print top-ups credit
 * `app_users.printBalance`. Every money action records a ledger row via
 * recordTransaction, atomic with the balance change in ONE db.transaction.
 *
 * Security contract ([SEC]):
 * - All reads/writes are org-scoped (server-derived orgId; never client).
 * - `packageId` and `pages` are client-supplied → re-validated server-side
 *   (load within orgId; bound pages to a positive integer). A cross-org or
 *   unknown package throws BEFORE any write.
 * - Amounts are ALWAYS server-computed from DB rows (package price, or
 *   pages × fixed print rate) — never from a client value.
 *   The credit/print-balance increment uses an atomic SQL `+`, not read-then-write.
 */
import { and, eq, isNull, asc, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  timeCreditPackages,
  appUsers,
  type TimeCreditPackage,
} from "@/lib/db/schema";
import { recordTransaction } from "@/lib/db/transactions";

// ponytail: flat print top-up rate. The live BW A4 calculator showed Rp500/page
// (verticals-rules.md); tiered print *top-up* pricing was never recon-captured,
// so we charge a flat rate and surface it in the UI (display == charge, [SEC]).
// Upgrade path: a print_topup_packages table if tiered top-up pricing returns.
export const PRINT_RATE_PER_PAGE_RUPIAH = 500;

// ---------------------------------------------------------------------------
// P1: listPackages
// ---------------------------------------------------------------------------

/**
 * Available (non-archived) time-credit packages for an org, sorted by
 * sortOrder. The caller's `orgId` is always server-derived.
 */
export function listPackages(orgId: string): Promise<TimeCreditPackage[]> {
  return db
    .select()
    .from(timeCreditPackages)
    .where(
      and(
        eq(timeCreditPackages.orgId, orgId),
        isNull(timeCreditPackages.archivedAt),
      ),
    )
    .orderBy(asc(timeCreditPackages.sortOrder));
}

// ---------------------------------------------------------------------------
// P2: purchasePackage  [SEC] — single transaction
// ---------------------------------------------------------------------------

/**
 * Purchase a time-credit package (simulated payment → COMPLETED).
 *
 * `packageId` is client-supplied: it is loaded within the caller's orgId, and
 * a cross-org / unknown / archived id throws UNKNOWN_PACKAGE before any write.
 * `amountRupiah` is the package's DB priceRupiah (never a client value). The
 * credit increment + ledger write are atomic in one db.transaction.
 *
 * Returns the updated timeCredits balance.
 */
export async function purchasePackage(input: {
  orgId: string;
  userId: string;
  packageId: string;
}): Promise<{ timeCredits: number }> {
  const { orgId, userId, packageId } = input;

  return db.transaction(async (tx) => {
    // Load the package scoped to this org only (cross-org guard [SEC]).
    const [pkg] = await tx
      .select()
      .from(timeCreditPackages)
      .where(
        and(
          eq(timeCreditPackages.id, packageId),
          eq(timeCreditPackages.orgId, orgId),
          isNull(timeCreditPackages.archivedAt),
        ),
      )
      .limit(1);

    if (!pkg) throw new Error("UNKNOWN_PACKAGE");

    // Atomic increment scoped to (id, orgId). 0 rows → user not in this org.
    const [updated] = await tx
      .update(appUsers)
      .set({
        timeCredits: sql`${appUsers.timeCredits} + ${pkg.hours}`,
        updatedAt: new Date(),
      })
      .where(and(eq(appUsers.id, userId), eq(appUsers.orgId, orgId)))
      .returning({ timeCredits: appUsers.timeCredits });

    if (!updated) throw new Error("USER_NOT_FOUND");

    await recordTransaction(
      {
        orgId,
        userId,
        type: "PACKAGE_PURCHASE",
        amountRupiah: pkg.priceRupiah,
        packageId: pkg.id,
        description: `Purchased ${pkg.name} package`,
      },
      tx,
    );

    return { timeCredits: updated.timeCredits };
  });
}

// ---------------------------------------------------------------------------
// P3: topUpPrint  [SEC] — single transaction
// ---------------------------------------------------------------------------

/**
 * Top up print balance (simulated payment → COMPLETED).
 *
 * `pages` is client-supplied and multiplies into the server-computed amount, so
 * it is validated as a positive bounded integer (no negative/zero/overflow).
 * `amountRupiah` = pages × PRINT_RATE_PER_PAGE_RUPIAH, never a client value.
 * The print-balance increment + ledger write are atomic in one db.transaction.
 *
 * Returns the updated printBalance.
 */
export async function topUpPrint(input: {
  orgId: string;
  userId: string;
  pages: number;
}): Promise<{ printBalance: number }> {
  const { orgId, userId, pages } = input;

  // Bound pages: a non-integer / non-positive / enormous value would manipulate
  // the amount (pages × rate) or overflow int4. Reject before any write ([SEC]).
  const MAX_PAGES = 10_000;
  if (!Number.isInteger(pages) || pages <= 0 || pages > MAX_PAGES) {
    throw new Error("INVALID_PAGES");
  }

  const amountRupiah = pages * PRINT_RATE_PER_PAGE_RUPIAH;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(appUsers)
      .set({
        printBalance: sql`${appUsers.printBalance} + ${pages}`,
        updatedAt: new Date(),
      })
      .where(and(eq(appUsers.id, userId), eq(appUsers.orgId, orgId)))
      .returning({ printBalance: appUsers.printBalance });

    if (!updated) throw new Error("USER_NOT_FOUND");

    await recordTransaction(
      {
        orgId,
        userId,
        type: "PRINT_TOPUP",
        amountRupiah,
        description: `Top up ${pages} print pages`,
      },
      tx,
    );

    return { printBalance: updated.printBalance };
  });
}
