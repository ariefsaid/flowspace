/**
 * Repository: transactions (the unified money ledger, I-020/021/022/023).
 *
 * Every money action (package purchase, cafe order, print job, booking) records a
 * row here. Member /history and the admin dashboard (recent + revenue) read it.
 * All reads/writes are org-scoped (server-derived orgId, never client). [SEC]
 */
import { and, eq, desc, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { transactions, type Transaction } from "@/lib/db/schema";
import type { TransactionType, TransactionStatus } from "@/lib/db/enums";

export type RecordTxnInput = {
  orgId: string;
  userId: string | null;
  type: TransactionType;
  description: string;
  amountRupiah: number;
  discountRupiah?: number;
  status?: TransactionStatus;
  cafeOrderId?: string | null;
  bookingId?: string | null;
  printJobId?: string | null;
  packageId?: string | null;
};

/**
 * Append a ledger row. Pass a Drizzle tx (`txdb`) to enlist in a caller's
 * transaction so the ledger write is atomic with the domain write.
 */
export async function recordTransaction(
  input: RecordTxnInput,
  txdb: Pick<typeof db, "insert"> = db,
): Promise<Transaction> {
  const [row] = await txdb
    .insert(transactions)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      type: input.type,
      description: input.description,
      amountRupiah: input.amountRupiah,
      discountRupiah: input.discountRupiah ?? 0,
      status: input.status ?? "COMPLETED",
      cafeOrderId: input.cafeOrderId ?? null,
      bookingId: input.bookingId ?? null,
      printJobId: input.printJobId ?? null,
      packageId: input.packageId ?? null,
    })
    .returning();
  return row;
}

/** Org + user scoped ledger, newest first (member /history). */
export function listTransactionsByUser(
  orgId: string,
  userId: string,
  limit = 100,
): Promise<Transaction[]> {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.userId, userId)))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);
}

/** Org-scoped recent ledger (admin dashboard). */
export function listRecentTransactions(orgId: string, limit = 10): Promise<Transaction[]> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.orgId, orgId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);
}

/** Sum of COMPLETED transaction amounts for the org since `since` (revenue KPI). */
export async function sumRevenueSince(orgId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amountRupiah}), 0)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.status, "COMPLETED"),
        gte(transactions.createdAt, since),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Patch the BOOKING ledger row linked to a booking.
 *
 * Replaces the two former helpers `settleBookingTransaction` (set status COMPLETED)
 * and `setBookingTransactionAmount` (set amountRupiah). Pass only the fields you
 * need to change; the WHERE clause is always org + bookingId + type='BOOKING'
 * (defence-in-depth; never touches another org's rows).
 *
 * Pass the caller's Drizzle tx (`txdb`) so the update is atomic with the domain
 * write (booking status / payment status flip).
 *
 * @param orgId     - Server-derived org (never client-supplied).
 * @param bookingId - The booking whose ledger row to patch.
 * @param patch     - Fields to set: { status?, amountRupiah? }.
 * @param txdb      - Optional Drizzle transaction context (defaults to the global db).
 */
export async function updateBookingTransaction(
  orgId: string,
  bookingId: string,
  patch: { status?: TransactionStatus; amountRupiah?: number },
  txdb: Pick<typeof db, "update"> = db,
): Promise<void> {
  await txdb
    .update(transactions)
    .set(patch)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.bookingId, bookingId),
        eq(transactions.type, "BOOKING"),
      ),
    );
}
