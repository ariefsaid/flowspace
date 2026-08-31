import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { appUsers, printTopupPackages, type PrintTopupPackage } from "@/lib/db/schema";
import { recordTransaction } from "@/lib/db/transactions";
import { lockUserRowForCreditWrite, int4ClampedAdd } from "@/lib/db/time-credit-lots";
import {
  simulatePaymentOutcome,
  type PaymentDecision,
} from "@/lib/topup/mockPaymentGateway";

export type PrintTopupPackageView = Pick<PrintTopupPackage, "id" | "pages" | "priceRupiah" | "sortOrder">;

export function listPrintTopupPackages(orgId: string): Promise<PrintTopupPackage[]> {
  return db.select().from(printTopupPackages)
    .where(and(eq(printTopupPackages.orgId, orgId), eq(printTopupPackages.isActive, true), isNull(printTopupPackages.archivedAt)))
    .orderBy(asc(printTopupPackages.sortOrder), asc(printTopupPackages.pages));
}

/**
 * Atomically load the stored price, credit balance, and write its ledger row.
 *
 * `simulatePayment` is a TEST-ONLY seam (defaults to always-approve, [SEC/MONEY]
 * — see lib/topup/mockPaymentGateway): a forced decline throws PAYMENT_DECLINED
 * BEFORE any balance change or ledger write.
 */
export async function purchasePrintTopup(input: {
  orgId: string;
  userId: string;
  packageId: string;
  simulatePayment?: PaymentDecision;
}) {
  if (!input.packageId.trim()) throw new Error("UNKNOWN_PACKAGE");
  return db.transaction(async (tx) => {
    const [pkg] = await tx.select().from(printTopupPackages).where(and(
      eq(printTopupPackages.id, input.packageId),
      eq(printTopupPackages.orgId, input.orgId),
      eq(printTopupPackages.isActive, true),
      isNull(printTopupPackages.archivedAt),
    )).limit(1);
    if (!pkg) throw new Error("UNKNOWN_PACKAGE");
    // [SEC][MONEY][I-047 fix round 2, finding 5] Canonical FIRST lock (FOR NO
    // KEY UPDATE) before the balance UPDATE and the FK-inserting ledger row —
    // same guard+lock as purchasePackage (see packages.ts). The user must
    // resolve within this org before any write [SEC].
    const user = await lockUserRowForCreditWrite(tx, input.orgId, input.userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    // [SEC/MONEY] Forced decline throws PAYMENT_DECLINED before any balance
    // change or ledger write (the held lock rolls back cleanly on throw).
    if (!simulatePaymentOutcome(input.simulatePayment)) {
      throw new Error("PAYMENT_DECLINED");
    }

    const [updatedUser] = await tx.update(appUsers)
      // [SEC][MONEY][I-047 fix-3] int4-clamped increment — clamps the
      // RESULT, not just the package's pages (see int4ClampedAdd).
      .set({ printBalance: int4ClampedAdd(appUsers.printBalance, pkg.pages), updatedAt: new Date() })
      .where(and(eq(appUsers.id, input.userId), eq(appUsers.orgId, input.orgId)))
      .returning({ id: appUsers.id });
    if (!updatedUser) throw new Error("USER_NOT_FOUND");
    return recordTransaction({
      orgId: input.orgId, userId: input.userId, type: "PRINT_TOPUP",
      description: `Print balance · ${pkg.pages} pages`, amountRupiah: pkg.priceRupiah,
      status: "COMPLETED", printTopupPackageId: pkg.id,
    }, tx);
  });
}
