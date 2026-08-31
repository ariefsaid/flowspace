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
import { and, eq, isNull, asc } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  timeCreditPackages,
  timeCreditLots,
  appUsers,
  type TimeCreditPackage,
} from "@/lib/db/schema";
import { recordTransaction } from "@/lib/db/transactions";
import { recomputeCreditCache, int4ClampedAdd, lockUserRowForCreditWrite } from "@/lib/db/time-credit-lots";
import {
  simulatePaymentOutcome,
  type PaymentDecision,
} from "@/lib/topup/mockPaymentGateway";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

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
 * `amountRupiah` is the package's DB priceRupiah (never a client value).
 *
 * I-040: the purchase creates a `time_credit_lots` row expiring exactly 90
 * days from now (OBS-824) instead of incrementing an aggregate; the ledger
 * write, the lot insert, and the derived-cache recompute
 * (`app_users.timeCredits` = SUM of non-expired `remainingHours`, FR-853)
 * are all atomic in one db.transaction.
 *
 * `simulatePayment` is a TEST-ONLY seam (defaults to always-approve, [SEC/MONEY]
 * — see lib/topup/mockPaymentGateway): a forced decline throws PAYMENT_DECLINED
 * BEFORE any ledger/lot write or balance change.
 *
 * Returns the recomputed derived timeCredits balance.
 */
export async function purchasePackage(input: {
  orgId: string;
  userId: string;
  packageId: string;
  simulatePayment?: PaymentDecision;
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

    // Cross-org guard [SEC]: the user must resolve within this org before
    // any write. [SEC][MONEY][I-047 fix round 2, finding 5] The guard select
    // is also the CANONICAL FIRST lock (FOR NO KEY UPDATE): both FK-inserting
    // statements below (the ledger row, the lot row) take an implicit weak
    // FOR KEY SHARE on this same app_users row, and recomputeCreditCache
    // takes a strong lock at the end — locking strong FIRST subsumes those
    // implicit weak locks and makes a concurrent purchase/spend/grant for
    // the same member queue here, holding nothing (the KEY SHARE →
    // strong-lock upgrade deadlock is structurally impossible; barrier test
    // in lib/db/credit-lock-order.int.test.ts).
    const user = await lockUserRowForCreditWrite(tx, orgId, userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    if (!simulatePaymentOutcome(input.simulatePayment)) {
      throw new Error("PAYMENT_DECLINED");
    }

    const txn = await recordTransaction(
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

    const purchasedAt = new Date();
    await tx.insert(timeCreditLots).values({
      orgId,
      userId,
      packageId: pkg.id,
      purchaseTransactionId: txn.id,
      totalHours: pkg.hours,
      remainingHours: pkg.hours,
      purchasedAt,
      expiresAt: new Date(purchasedAt.getTime() + NINETY_DAYS_MS),
    });

    const timeCredits = await recomputeCreditCache({ orgId, userId, tx });
    return { timeCredits };
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
    // [SEC][MONEY][I-047 fix round 2, finding 5] Canonical FIRST lock, before
    // the balance UPDATE and the FK-inserting ledger write below — same
    // guard+lock as purchasePackage (see that comment). Also doubles as the
    // org-scoped existence guard: USER_NOT_FOUND before any write.
    const user = await lockUserRowForCreditWrite(tx, orgId, userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    const [updated] = await tx
      .update(appUsers)
      .set({
        // [SEC][MONEY][I-047 fix-3] int4-clamped increment — clamps the
        // RESULT, not just the pages bound (see int4ClampedAdd).
        printBalance: int4ClampedAdd(appUsers.printBalance, pages),
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
