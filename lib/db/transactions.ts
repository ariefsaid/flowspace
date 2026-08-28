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
  printTopupPackageId?: string | null;
  /** Settlement detail for a booking-create/checkout ledger row
   *  (`cash|qris|time_credits|online`); null while unsettled (I-040). */
  paymentMethod?: string | null;
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
      printTopupPackageId: input.printTopupPackageId ?? null,
      paymentMethod: input.paymentMethod ?? null,
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
  patch: { status?: TransactionStatus; amountRupiah?: number; paymentMethod?: string | null },
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

/**
 * The exact hours still owed for a booking's PENDING BOOKING ledger row(s)
 * (i.e. extension charges not yet settled) [SEC][MONEY]. `amountRupiah +
 * discountRupiah` reconstructs each row's PRE-discount rupiah exactly
 * (`computeBookingPrice`'s `baseAmountRupiah = hours * ratePerHourRupiah`,
 * an exact integer product — the discount is applied AFTER, so adding it
 * back recovers baseAmountRupiah losslessly regardless of the discount
 * pct used at extend time). Dividing by the booking's fixed
 * `ratePerHourRupiah` then recovers the exact integer hours — no rounding
 * heuristic, no new schema column needed. Returns 0 when nothing is pending
 * (a scheduled booking's base charge is ALWAYS already settled by the time
 * it reaches ACTIVE — see checkoutBooking's prepaid-double-debit fix).
 */
export async function pendingBookingHours(
  orgId: string,
  bookingId: string,
  ratePerHourRupiah: number,
  txdb: Pick<typeof db, "select"> = db,
): Promise<number> {
  if (ratePerHourRupiah <= 0) return 0;
  const rows = await txdb
    .select({ amountRupiah: transactions.amountRupiah, discountRupiah: transactions.discountRupiah })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.bookingId, bookingId),
        eq(transactions.type, "BOOKING"),
        eq(transactions.status, "PENDING"),
      ),
    );
  if (rows.length === 0) return 0;
  const totalBaseRupiah = rows.reduce((sum, r) => sum + r.amountRupiah + r.discountRupiah, 0);
  return Math.round(totalBaseRupiah / ratePerHourRupiah);
}

/**
 * Checkout settlement [SEC][MONEY]: flips every still-PENDING BOOKING ledger
 * row for a booking to COMPLETED, BY TRANSACTION ID — one row at a time,
 * preserving EACH row's own `amountRupiah` (the base row and any pending
 * extension row settle INDEPENDENTLY). Fixes a revenue double-count: the
 * prior single bulk UPDATE (`updateBookingTransaction`, still used by
 * approvePayment where at most one row can ever exist) overwrote EVERY
 * BOOKING-type row for the booking with the SAME recomputed total
 * (`amountRupiah`), so a base row (already paid) plus a pending extension
 * row both ended up holding the checkout's total — the ledger summed to
 * ~2x the real amount.
 *
 * `walkinAmountRupiah` is the one legitimate exception: a walk-in's single
 * BOOKING row is recorded at amount 0 at create time (its price is only
 * known at checkout, from elapsed time) — that row's amount IS meant to be
 * set here, to the freshly-computed total.
 */
export async function settleCheckoutTransactions(
  orgId: string,
  bookingId: string,
  opts: { paymentMethod: string; walkinAmountRupiah?: number },
  txdb: Pick<typeof db, "select" | "update"> = db,
): Promise<void> {
  const pending = await txdb
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.bookingId, bookingId),
        eq(transactions.type, "BOOKING"),
        eq(transactions.status, "PENDING"),
      ),
    );

  for (const row of pending) {
    await txdb
      .update(transactions)
      .set({
        status: "COMPLETED",
        paymentMethod: opts.paymentMethod,
        ...(opts.walkinAmountRupiah != null ? { amountRupiah: opts.walkinAmountRupiah } : {}),
      })
      .where(and(eq(transactions.id, row.id), eq(transactions.orgId, orgId)));
  }
}
