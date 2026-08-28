/**
 * Server-authoritative print-job repository (I-043).
 *
 * Every operation is scoped by a server-derived organization id. Pricing,
 * printer capabilities, page ranges, balance debits, and ledger writes are
 * checked on the server; the browser never supplies an authoritative value.
 */
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  appUsers,
  orgPrintPricing,
  printJobs,
  printers,
  type PrintJob,
} from "@/lib/db/schema";
import { recordTransaction } from "@/lib/db/transactions";
import { getTierDiscounts } from "@/lib/db/tier-config";
import type { PrintColorMode } from "@/lib/db/enums";
import { parsePageRange, computeEffectiveSheets } from "@/lib/print/page-range";
import { computePrintTotal, resolvePrintPrice } from "@/lib/print/pricing";
import { transitionPrintJob } from "@/lib/print/lifecycle";
import type { PrintJobStatus } from "@/lib/db/enums";

export type PrintJobHistoryRow = PrintJob & {
  printerName: string | null;
  printerDisplayName: string | null;
};

/** Member history is deliberately bounded and org + user scoped. */
export async function listPrintJobsByUser(
  orgId: string,
  userId: string,
  limit = 20,
): Promise<PrintJobHistoryRow[]> {
  const rows = await db
    .select({ job: printJobs, printerName: printers.name, printerDisplayName: printers.displayName })
    .from(printJobs)
    .leftJoin(printers, eq(printJobs.printerId, printers.id))
    .where(and(eq(printJobs.orgId, orgId), eq(printJobs.userId, userId)))
    .orderBy(desc(printJobs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 20));

  return rows.map(({ job, printerName, printerDisplayName }) => ({
    ...job,
    printerName,
    printerDisplayName,
  }));
}

/** Org-scoped, bounded admin report listing. */
export function listPrintJobsForAdmin(orgId: string, limit = 500): Promise<PrintJob[]> {
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
  totalRevenue: number;
  completedCount: number;
};

export async function getPrintReportSummary(orgId: string): Promise<PrintReportSummary> {
  const [row] = await db
    .select({
      totalJobs: sql<number>`count(*)::int`,
      totalPages: sql<number>`coalesce(sum(coalesce(${printJobs.totalPages}, ${printJobs.pages} * ${printJobs.copies})), 0)::int`,
      uniqueUsers: sql<number>`count(distinct ${printJobs.userId})::int`,
      totalRevenue: sql<number>`coalesce(sum(${printJobs.totalRupiah}) filter (where ${printJobs.status} = 'COMPLETED'), 0)::int`,
      completedCount: sql<number>`count(*) filter (where ${printJobs.status} = 'COMPLETED')::int`,
    })
    .from(printJobs)
    .where(eq(printJobs.orgId, orgId));
  return row ?? { totalJobs: 0, totalPages: 0, uniqueUsers: 0, totalRevenue: 0, completedCount: 0 };
}

type SubmitPrintJobInput = {
  orgId: string;
  userId: string;
  fileName: string;
  /** Legacy alias for documentPages; new callers should use documentPages. */
  pages?: number;
  pageRange?: string;
  documentPages?: number;
  printerId?: string;
  copies: number;
  colorMode: PrintColorMode;
  paperSize?: string;
  duplex?: boolean;
  storagePath?: string | null;
};

/**
 * Validate, price, debit, and persist one print job atomically.
 * The optional legacy fields are retained for existing callers during the
 * migration; all new action submissions provide pageRange/documentPages.
 */
export async function submitPrintJob(input: SubmitPrintJobInput): Promise<PrintJob> {
  const fileName = (input.fileName ?? "").trim().slice(0, 255);
  if (!fileName) throw new Error("INVALID_FILE");
  const documentPages = input.documentPages ?? input.pages ?? 0;
  if (!Number.isInteger(documentPages) || documentPages <= 0) {
    throw new Error("INVALID_DOCUMENT_PAGES");
  }
  const validDocumentPages = documentPages;
  if (!Number.isInteger(input.copies) || input.copies <= 0) {
    throw new Error("INVALID_COPIES");
  }
  if (input.colorMode !== "BW" && input.colorMode !== "COLOR") {
    throw new Error("INVALID_COLOR_MODE");
  }
  const paperSize = input.paperSize ?? "A4";
  if (paperSize !== "A4" && paperSize !== "A3" && paperSize !== "F4") {
    throw new Error("INVALID_PAPER_SIZE");
  }

  const parsed = parsePageRange(input.pageRange ?? "all", validDocumentPages);
  const totalPages = computeEffectiveSheets(parsed.pageCount, input.copies);
  const [user] = await db
    .select()
    .from(appUsers)
    .where(and(eq(appUsers.id, input.userId), eq(appUsers.orgId, input.orgId)))
    .limit(1);
  if (!user) throw new Error("NOT_FOUND");
  const tierDiscounts = await getTierDiscounts(input.orgId, user.membershipTier);

  return db.transaction(async (tx) => {
    // Re-check capability and pricing in the same transaction as the debit.
    const printerRows = await tx
      .select()
      .from(printers)
      .where(
        and(
          eq(printers.orgId, input.orgId),
          eq(printers.isActive, true),
          isNull(printers.archivedAt),
          input.printerId ? eq(printers.id, input.printerId) : eq(printers.isDefault, true),
        ),
      )
      .limit(1);
    const printer = printerRows[0];
    if (!printer) throw new Error("INVALID_PRINTER");
    if (input.colorMode === "COLOR" && !printer.colorSupport) {
      throw new Error("UNSUPPORTED_COLOR");
    }
    if (!printer.paperSizes.includes(paperSize)) {
      throw new Error("UNSUPPORTED_PAPER");
    }

    const pricingRows = await tx
      .select({
        colorMode: orgPrintPricing.colorMode,
        paperSize: orgPrintPricing.paperSize,
        pricePerPageRupiah: orgPrintPricing.pricePerPageRupiah,
        isActive: orgPrintPricing.isActive,
      })
      .from(orgPrintPricing)
      .where(eq(orgPrintPricing.orgId, input.orgId));
    const pricePerPageRupiah = resolvePrintPrice(pricingRows, input.colorMode, paperSize);
    const totals = computePrintTotal({
      pages: parsed.pageCount,
      copies: input.copies,
      pricePerPageRupiah,
      discountPct: tierDiscounts.printDiscountPct,
    });

    const [debited] = await tx
      .update(appUsers)
      .set({
        printBalance: sql`${appUsers.printBalance} - ${totalPages}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(appUsers.id, user.id),
          eq(appUsers.orgId, input.orgId),
          gte(appUsers.printBalance, totalPages),
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
        pages: validDocumentPages,
        copies: input.copies,
        colorMode: input.colorMode,
        paperSize,
        duplex: input.duplex ?? false,
        pricePerPageRupiah,
        discountRupiah: totals.discountRupiah,
        totalRupiah: totals.totalRupiah,
        storagePath: input.storagePath ?? null,
        pageRange: parsed.normalized,
        totalPages,
        printerId: printer.id,
        status: "PENDING",
      })
      .returning();

    await recordTransaction(
      {
        orgId: input.orgId,
        userId: input.userId,
        type: "PRINT_JOB",
        description: `Print ${fileName} · ${parsed.normalized}×${input.copies} ${input.colorMode}`,
        amountRupiah: totals.totalRupiah,
        discountRupiah: totals.discountRupiah,
        status: "PENDING",
        printJobId: job.id,
      },
      tx,
    );
    return job;
  });
}

/** Advance one job through the server-owned lifecycle, with an org row lock. */
export async function advancePrintJob(
  orgId: string,
  jobId: string,
  nextStatus: PrintJobStatus,
  metadata: { processedBy?: string; errorMessage?: string } = {},
): Promise<PrintJob> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(printJobs)
      .where(and(eq(printJobs.id, jobId), eq(printJobs.orgId, orgId)))
      .for("update")
      .limit(1);
    if (!current) throw new Error("NOT_FOUND");

    transitionPrintJob(current.status, nextStatus, {
      processedBy: metadata.processedBy,
      errorMessage: metadata.errorMessage,
    });
    const now = new Date();
    const values: Partial<typeof printJobs.$inferInsert> = {
      status: nextStatus,
      updatedAt: now,
    };
    if (nextStatus === "PROCESSING" || nextStatus === "READY" || nextStatus === "FAILED") {
      values.processedBy = metadata.processedBy ?? current.processedBy;
      values.processedAt = now;
    }
    if (nextStatus === "FAILED") values.errorMessage = metadata.errorMessage ?? "Print processing failed";
    if (nextStatus === "PROCESSING" && current.status === "FAILED") values.errorMessage = null;
    if (nextStatus === "COMPLETED") {
      values.completedAt = now;
      values.processedBy = metadata.processedBy ?? current.processedBy;
      values.processedAt = current.processedAt ?? now;
      values.errorMessage = null;
    }
    const [updated] = await tx
      .update(printJobs)
      .set(values)
      .where(and(eq(printJobs.id, jobId), eq(printJobs.orgId, orgId)))
      .returning();
    return updated;
  });
}
