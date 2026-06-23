/**
 * Repository: PrintJob (I-023, [SEC] money path).
 *
 * All reads/writes are server-side via Drizzle over Supabase Postgres (ADR-0015).
 * Every function takes `orgId` derived from the server session — the client
 * NEVER supplies it (ADR-0004). Totals are ALWAYS server-computed via
 * computePrintTotal from the user's loaded tier; no client price is trusted.
 *
 * The print balance lives on `app_users.printBalance` (integer pages/sheets).
 * A job of N pages × C copies consumes N×C sheets. The debit + job insert +
 * ledger write happen in ONE db.transaction so they are atomic.
 */
import { and, eq, desc, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { printJobs, appUsers, type PrintJob } from "@/lib/db/schema";
import { recordTransaction } from "@/lib/db/transactions";
import { computePrintTotal } from "@/lib/print/pricing";
import { getPrintPricing } from "@/lib/db/print-pricing";
import { getTierDiscounts } from "@/lib/db/tier-config";
import type { PrintColorMode } from "@/lib/db/enums";

// ---------------------------------------------------------------------------
// P1: listPrintJobsByUser
// ---------------------------------------------------------------------------

/**
 * Org + user scoped print history, newest first (member /print surface).
 * AC-0237 / FR-243.
 */
export function listPrintJobsByUser(
  orgId: string,
  userId: string,
  limit = 100,
): Promise<PrintJob[]> {
  return db
    .select()
    .from(printJobs)
    .where(and(eq(printJobs.orgId, orgId), eq(printJobs.userId, userId)))
    .orderBy(desc(printJobs.createdAt))
    .limit(limit);
}

/**
 * Org-scoped listing of print jobs for the admin "Laporan Print" report table,
 * newest first (member names are joined in the page via findProfilesByIds,
 * matching the admin bookings pattern). The `limit` caps the rendered TABLE only
 * — summary aggregates come from getPrintReportSummary (SQL, uncapped) so they
 * never understate. AC-300 / FR-300, FR-301.
 */
export function listPrintJobsForAdmin(
  orgId: string,
  limit = 500,
): Promise<PrintJob[]> {
  return db
    .select()
    .from(printJobs)
    .where(eq(printJobs.orgId, orgId))
    .orderBy(desc(printJobs.createdAt))
    .limit(limit);
}

export type PrintReportSummary = {
  totalJobs: number;
  totalPages: number;
  uniqueUsers: number;
  /** Σ net charge (totalRupiah) over COMPLETED jobs. */
  totalRevenue: number;
  completedCount: number;
};

/**
 * Org-scoped print-report summary computed in SQL over ALL the org's jobs —
 * independent of the table's row cap, so totals/revenue never understate on a
 * high-volume org (security review M2). FR-302 / AC-301.
 */
export async function getPrintReportSummary(orgId: string): Promise<PrintReportSummary> {
  const [row] = await db
    .select({
      totalJobs: sql<number>`count(*)::int`,
      totalPages: sql<number>`coalesce(sum(${printJobs.pages}), 0)::int`,
      uniqueUsers: sql<number>`count(distinct ${printJobs.userId})::int`,
      totalRevenue: sql<number>`coalesce(sum(${printJobs.totalRupiah}) filter (where ${printJobs.status} = 'COMPLETED'), 0)::int`,
      completedCount: sql<number>`count(*) filter (where ${printJobs.status} = 'COMPLETED')::int`,
    })
    .from(printJobs)
    .where(eq(printJobs.orgId, orgId));
  return (
    row ?? {
      totalJobs: 0,
      totalPages: 0,
      uniqueUsers: 0,
      totalRevenue: 0,
      completedCount: 0,
    }
  );
}

// ---------------------------------------------------------------------------
// P2: submitPrintJob  [SEC] — server-priced atomic submit
// ---------------------------------------------------------------------------

/**
 * Submits a print job for the signed-in member.
 *
 * Security / money contract:
 * - `orgId`/`userId` are server-derived (from the session); the client never
 *   supplies them. The user row is loaded scoped to `(id, orgId)` so a
 *   cross-org userId resolves to NOT_FOUND.
 * - The tier is loaded from that row and the total is computed server-side via
 *   computePrintTotal — no client price/total is ever trusted.
 * - The printBalance debit is an atomic conditional UPDATE guarded by
 *   `printBalance >= sheets`, evaluated at write time inside the tx — so two
 *   concurrent jobs for the same user cannot overdraw (race-safe).
 * - On insufficient balance the tx throws INSUFFICIENT_BALANCE and rolls back:
 *   no job, no ledger row, no debit (AC-0235, "no write").
 * - Job insert + balance debit + ledger write are all in ONE db.transaction.
 *
 * AC-0234, AC-0235, AC-0236 / FR-240–242.
 */
export async function submitPrintJob(input: {
  orgId: string;
  userId: string;
  fileName: string;
  pages: number;
  copies: number;
  colorMode: PrintColorMode;
  paperSize?: string;
  duplex?: boolean;
  storagePath?: string | null;
}): Promise<PrintJob> {
  // --- Input validation (client-supplied scalars; bound before any DB work) ---
  const fileName = (input.fileName ?? "").trim().slice(0, 255);
  if (!fileName) throw new Error("INVALID_FILE");
  if (!Number.isInteger(input.pages) || input.pages <= 0) {
    throw new Error("INVALID_PAGES");
  }
  if (!Number.isInteger(input.copies) || input.copies <= 0) {
    throw new Error("INVALID_COPIES");
  }
  const paperSize = (input.paperSize ?? "").trim() || "A4";
  const duplex = input.duplex ?? false;

  // --- Load the user within the org (tier + cross-org isolation) ---
  const [user] = await db
    .select()
    .from(appUsers)
    .where(and(eq(appUsers.id, input.userId), eq(appUsers.orgId, input.orgId)))
    .limit(1);
  if (!user) throw new Error("NOT_FOUND");

  // --- Server-side pricing from org config + the loaded tier ([SEC]) ---
  const [pricing, tierDiscounts] = await Promise.all([
    getPrintPricing(input.orgId),
    getTierDiscounts(input.orgId, user.membershipTier),
  ]);
  const totals = computePrintTotal({
    pages: input.pages,
    copies: input.copies,
    colorMode: input.colorMode,
    bwRateRupiah: pricing.bwRatePerPageRupiah,
    colorRateRupiah: pricing.colorRatePerPageRupiah,
    discountPct: tierDiscounts.printDiscountPct,
  });

  const sheets = input.pages * input.copies;

  return db.transaction(async (tx) => {
    // Atomic, race-safe debit: the guard `printBalance >= sheets` is evaluated
    // at write time, so concurrent jobs can't overdraw. Returning 0 rows ⇒ the
    // balance was insufficient at commit time → throw + rollback (no write).
    const [debited] = await tx
      .update(appUsers)
      .set({
        printBalance: sql`${appUsers.printBalance} - ${sheets}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(appUsers.id, user.id),
          eq(appUsers.orgId, input.orgId),
          gte(appUsers.printBalance, sheets),
        ),
      )
      .returning({ id: appUsers.id });
    if (!debited) throw new Error("INSUFFICIENT_BALANCE");

    const [job] = await tx
      .insert(printJobs)
      .values({
        orgId: input.orgId,
        userId: input.userId,
        fileName,
        pages: input.pages,
        copies: input.copies,
        colorMode: input.colorMode,
        paperSize,
        duplex,
        pricePerPageRupiah: totals.pricePerPageRupiah,
        discountRupiah: totals.discountRupiah,
        totalRupiah: totals.totalRupiah,
        storagePath: input.storagePath ?? null,
        status: "PENDING",
      })
      .returning();

    await recordTransaction(
      {
        orgId: input.orgId,
        userId: input.userId,
        type: "PRINT_JOB",
        description: `Print ${fileName} · ${input.pages}×${input.copies} ${input.colorMode}`,
        amountRupiah: totals.totalRupiah,
        discountRupiah: totals.discountRupiah,
        // Job is created PENDING; the ledger row mirrors that until the
        // printer marks it READY/COMPLETED (admin flow, separate issue).
        status: "PENDING",
        printJobId: job.id,
      },
      tx,
    );

    return job;
  });
}
