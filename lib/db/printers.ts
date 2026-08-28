/**
 * Repository: printers (I-043, spec 0009).
 *
 * Org-scoped printer CRUD + default selection. Every method takes the
 * server-derived `orgId` (ADR-0004). Removal is soft-archive (archived_at) —
 * `printer_id` on print_jobs is ON DELETE RESTRICT, so referenced printers can
 * never be hard-deleted.
 *
 * The single-non-archived-default invariant is enforced BOTH in the
 * transaction (per-org advisory lock serializes concurrent default writes,
 * AC-633) and by the partial unique index `printers_org_single_default_idx`
 * as a concurrency backstop.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { printers, type Printer } from "@/lib/db/schema";
import type { PrinterType } from "@/lib/db/enums";
import { PRINT_PAPER_SIZES } from "@/lib/db/print-pricing";

export type PrinterPaperSize = (typeof PRINT_PAPER_SIZES)[number];

export type CreatePrinterInput = {
  name: string;
  displayName: string;
  location?: string | null;
  printerType?: PrinterType;
  colorSupport: boolean;
  paperSizes: PrinterPaperSize[];
  sortOrder?: number;
};

export type UpdatePrinterInput = Partial<Omit<CreatePrinterInput, "name">> & {
  name?: string;
  isActive?: boolean;
};

function assertValid(input: {
  name?: string;
  displayName?: string;
  paperSizes?: PrinterPaperSize[];
}): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new Error("INVALID_PRINTER_NAME");
  }
  if (input.displayName !== undefined && !input.displayName.trim()) {
    throw new Error("INVALID_PRINTER_NAME");
  }
  if (input.paperSizes !== undefined) {
    if (
      !Array.isArray(input.paperSizes) ||
      input.paperSizes.length === 0 ||
      input.paperSizes.some(
        (s) => !(PRINT_PAPER_SIZES as readonly string[]).includes(s),
      )
    ) {
      throw new Error("INVALID_PRINTER_PAPER");
    }
  }
}

/** Map a Postgres unique-violation on name/default keys to a clear error. */
function mapUniqueViolation(e: unknown): void {
  const text = [
    e instanceof Error ? e.message : String(e),
    e instanceof Error && e.cause instanceof Error ? e.cause.message : "",
  ].join("\n");
  if (/printers_org_id_name_key/.test(text)) {
    throw new Error("PRINTER_NAME_EXISTS");
  }
  if (/printers_org_single_default_idx/.test(text)) {
    throw new Error("PRINTER_DEFAULT_CONFLICT");
  }
}

/** Active, non-archived printers for the member print form, sorted for display. */
export function listActivePrinters(orgId: string): Promise<Printer[]> {
  return db
    .select()
    .from(printers)
    .where(and(eq(printers.orgId, orgId), eq(printers.isActive, true), isNull(printers.archivedAt)))
    .orderBy(asc(printers.sortOrder), asc(printers.name));
}

/** All printers (incl. archived) for the admin CRUD page. */
export function listPrintersForAdmin(orgId: string): Promise<Printer[]> {
  return db
    .select()
    .from(printers)
    .where(eq(printers.orgId, orgId))
    .orderBy(asc(printers.archivedAt), asc(printers.sortOrder), asc(printers.name));
}

/**
 * Create a printer in the org (ADMIN-only — the caller enforces role).
 * Rejects invalid fields and duplicate (org, name) with no write.
 */
export async function createPrinter(
  orgId: string,
  input: CreatePrinterInput,
): Promise<string> {
  assertValid(input);
  try {
    return await db.transaction(async (tx) => {
      // Serialize default mutations per org (AC-633).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orgId}, 42))`);
      const [row] = await tx
        .insert(printers)
        .values({
          orgId,
          name: input.name.trim(),
          displayName: input.displayName.trim(),
          location: input.location?.trim() || null,
          printerType: input.printerType ?? "LASER",
          colorSupport: input.colorSupport,
          paperSizes: input.paperSizes,
          isActive: true,
          isDefault: false,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning({ id: printers.id });
      return row.id;
    });
  } catch (e) {
    mapUniqueViolation(e);
    throw e;
  }
}

/**
 * Update a printer's fields, org-scoped (ADMIN-only — caller enforces role).
 * A printer id from another org resolves to NOT_FOUND (no write).
 */
export async function updatePrinter(
  orgId: string,
  id: string,
  patch: UpdatePrinterInput,
): Promise<void> {
  assertValid(patch);
  const sets: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) sets.name = patch.name.trim();
  if (patch.displayName !== undefined) sets.displayName = patch.displayName.trim();
  if (patch.location !== undefined) sets.location = patch.location?.trim() || null;
  if (patch.printerType !== undefined) sets.printerType = patch.printerType;
  if (patch.colorSupport !== undefined) sets.colorSupport = patch.colorSupport;
  if (patch.paperSizes !== undefined) sets.paperSizes = patch.paperSizes;
  if (patch.isActive !== undefined) sets.isActive = patch.isActive;
  if (patch.sortOrder !== undefined) sets.sortOrder = patch.sortOrder;

  const [row] = await db
    .update(printers)
    .set(sets)
    .where(and(eq(printers.id, id), eq(printers.orgId, orgId)))
    .returning({ id: printers.id });
  if (!row) throw new Error("NOT_FOUND");
}

/**
 * Soft-archive a printer (the only removal path — FK RESTRICT blocks deletes).
 * Archiving also deactivates it so member listings drop it immediately.
 */
export async function archivePrinter(orgId: string, id: string): Promise<void> {
  const now = new Date();
  const [row] = await db
    .update(printers)
    .set({ archivedAt: now, isActive: false, updatedAt: now })
    .where(and(eq(printers.id, id), eq(printers.orgId, orgId)))
    .returning({ id: printers.id });
  if (!row) throw new Error("NOT_FOUND");
}

/**
 * Mark one printer as the org's single non-archived default (ADMIN-only).
 *
 * AC-633: the per-org advisory transaction lock serializes concurrent default
 * writes (clear-then-set never interleaves across transactions); the partial
 * unique index backstops any path the lock cannot cover.
 */
export async function setDefaultPrinter(orgId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orgId}, 42))`);

    const [target] = await tx
      .select({ id: printers.id, archivedAt: printers.archivedAt })
      .from(printers)
      .where(and(eq(printers.id, id), eq(printers.orgId, orgId)))
      .limit(1);
    if (!target) throw new Error("NOT_FOUND");
    if (target.archivedAt) throw new Error("ARCHIVED_PRINTER");

    const now = new Date();
    await tx
      .update(printers)
      .set({ isDefault: false, updatedAt: now })
      .where(
        and(
          eq(printers.orgId, orgId),
          eq(printers.isDefault, true),
          isNull(printers.archivedAt),
        ),
      );
    await tx
      .update(printers)
      .set({ isDefault: true, updatedAt: now })
      .where(and(eq(printers.id, id), eq(printers.orgId, orgId)));
  });
}
