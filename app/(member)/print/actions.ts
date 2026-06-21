"use server";
/**
 * Print server actions — member print-job submission (I-023).
 *
 * orgId + userId are always resolved server-side from the session; clients
 * never supply them (ADR-0004). Totals are computed server-side by
 * submitPrintJob from the loaded tier (FR-242, [SEC]).
 *
 * [SEC] — file upload (security-review hardening):
 *  - A file is REQUIRED; MIME + size are validated server-side (validatePrintFile)
 *    against an allowlist that matches the bucket's allowed_mime_types (0007).
 *  - The upload happens BEFORE the charge: the document is written to Storage
 *    first, then the job is created/debited. A rejected/failed upload therefore
 *    never produces a charged orphan job (the prior order did).
 *  - The Storage path is org-scoped (<orgId>/print/<docId>/<safeFileName>) and the
 *    docId is server-generated; orgId/userId come from the session, never the client.
 *  - The service-role key never leaves the server (admin client is server-only).
 *
 * FR-240..243 / AC-0234..0238.
 */
import { createId } from "@paralleldrive/cuid2";
import { requireSession } from "@/lib/auth/session";
import { submitPrintJob } from "@/lib/db/print";
import {
  uploadPrintDocument,
  buildPrintStoragePath,
  validatePrintFile,
  validatePrintMagicBytes,
} from "@/lib/storage/uploads";
import type { PrintColorMode } from "@/lib/db/enums";

/**
 * Submit a print job for the signed-in member. Takes a FormData payload:
 *  - `file`       — the document to print (Blob/File) — REQUIRED.
 *  - `fileName`   — display name (string).
 *  - `pages` / `copies` — integer strings.
 *  - `colorMode`  — "BW" | "COLOR".
 *  - `paperSize`  — optional paper size string.
 *  - `duplex`     — "true" | "false".
 */
export async function submitPrintJobAction(input: FormData) {
  const user = await requireSession();

  const fileName =
    (input.get("fileName") as string | null)?.trim() || "dokumen.pdf";
  const pages = parseInt((input.get("pages") as string) || "1", 10);
  const copies = parseInt((input.get("copies") as string) || "1", 10);
  const colorMode = ((input.get("colorMode") as string) || "BW") as PrintColorMode;
  const paperSize = (input.get("paperSize") as string) || undefined;
  const duplex = input.get("duplex") === "true";

  // A file is required (no metadata-only jobs). [SEC]
  const rawFile = input.get("file");
  if (!(rawFile instanceof Blob) || rawFile.size === 0) {
    throw new Error("FILE_REQUIRED");
  }
  // Validate MIME + size server-side BEFORE any write (throws on bad type/size).
  validatePrintFile(rawFile.type, rawFile.size);

  // Upload FIRST so a Storage rejection can't leave a charged orphan job. The
  // path id is server-generated; the upload is org-scoped to the session org.
  const docId = createId();
  const storagePath = buildPrintStoragePath(user.orgId, docId, fileName);
  const arrayBuffer = await rawFile.arrayBuffer();
  // Magic-byte check: ensure file content matches the claimed MIME [SEC].
  // Must run AFTER arrayBuffer is read, BEFORE uploading to Storage.
  validatePrintMagicBytes(Buffer.from(arrayBuffer), rawFile.type);
  await uploadPrintDocument(
    user.orgId,
    storagePath,
    Buffer.from(arrayBuffer),
    rawFile.type,
  );

  // Only after a successful upload do we create + debit the job (atomic:
  // debit + job + ledger in one tx inside submitPrintJob).
  return submitPrintJob({
    orgId: user.orgId,
    userId: user.id,
    fileName,
    pages,
    copies,
    colorMode,
    paperSize,
    duplex,
    storagePath,
  });
}
