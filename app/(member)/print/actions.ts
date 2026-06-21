"use server";
/**
 * Print server actions — member print-job submission (I-023).
 *
 * orgId + userId are always resolved server-side from the session; clients
 * never supply them (ADR-0004). Totals are computed server-side by
 * submitPrintJob from the loaded tier (FR-232, [SEC]).
 *
 * [SEC] — file upload:
 *  - File bytes, MIME type, and size are read from the FormData on the server.
 *  - MIME type is validated against an allowlist (validatePrintFile).
 *  - File size is capped (MAX_PRINT_FILE_SIZE_BYTES = 10 MB).
 *  - The Storage path is org-scoped (<orgId>/print/<jobId>/<safeFileName>).
 *  - orgId/userId always come from the server session — never from the client.
 *  - The service-role key never leaves the server (admin client is server-only).
 */
import { requireSession } from "@/lib/auth/session";
import { submitPrintJob } from "@/lib/db/print";
import {
  uploadPrintDocument,
  buildPrintStoragePath,
  validatePrintFile,
} from "@/lib/storage/uploads";
import type { PrintColorMode } from "@/lib/db/enums";

/**
 * Submit a print job for the signed-in member.
 *
 * Accepts a FormData payload containing:
 *  - `file`       — the document to print (Blob/File).  Optional: when omitted
 *                   (e.g. in the test environment with no real file), the job is
 *                   created with the provided fileName and no storage upload occurs.
 *  - `fileName`   — display name (string, required).
 *  - `pages`      — integer string.
 *  - `copies`     — integer string.
 *  - `colorMode`  — "BW" | "COLOR".
 *  - `paperSize`  — optional paper size string.
 *  - `duplex`     — "true" | "false".
 *
 * FR-230, FR-231, FR-232 / AC-0234, AC-0235, AC-0236.
 */
export async function submitPrintJobAction(
  input:
    | FormData
    | {
        fileName: string;
        pages: number;
        copies: number;
        colorMode: PrintColorMode;
        paperSize?: string;
        duplex?: boolean;
        file?: File;
      }
) {
  const user = await requireSession();

  // Normalise: accept both FormData (real upload path) and the plain-object
  // shape (kept for backward-compat so the test mock API stays unchanged).
  let fileName: string;
  let pages: number;
  let copies: number;
  let colorMode: PrintColorMode;
  let paperSize: string | undefined;
  let duplex: boolean | undefined;
  let fileBlob: Blob | null = null;
  let fileMime: string | undefined;

  if (input instanceof FormData) {
    fileName = (input.get("fileName") as string | null)?.trim() || "dokument.pdf";
    pages = parseInt((input.get("pages") as string) || "1", 10);
    copies = parseInt((input.get("copies") as string) || "1", 10);
    colorMode = ((input.get("colorMode") as string) || "BW") as PrintColorMode;
    paperSize = (input.get("paperSize") as string) || undefined;
    duplex = input.get("duplex") === "true";

    const rawFile = input.get("file");
    if (rawFile instanceof Blob && rawFile.size > 0) {
      fileBlob = rawFile;
      fileMime = rawFile.type;
      // [SEC] validate MIME + size server-side before any I/O
      validatePrintFile(fileMime, rawFile.size);
    }
  } else {
    fileName = input.fileName;
    pages = input.pages;
    copies = input.copies;
    colorMode = input.colorMode;
    paperSize = input.paperSize;
    duplex = input.duplex;

    if (input.file && input.file.size > 0) {
      fileBlob = input.file;
      fileMime = input.file.type;
      // [SEC] validate MIME + size server-side before any I/O
      validatePrintFile(fileMime, input.file.size);
    }
  }

  // Create the print job (atomic DB write — debit + job + ledger).
  const job = await submitPrintJob({
    orgId: user.orgId,
    userId: user.id,
    fileName,
    pages,
    copies,
    colorMode,
    paperSize,
    duplex,
  });

  // Upload file bytes to Storage AFTER the job is created so the path is
  // derived from the real jobId (<orgId>/print/<jobId>/<safeFileName>).
  // [SEC] org-scoped path — orgId from the server session, never client-supplied.
  if (fileBlob) {
    const storagePath = buildPrintStoragePath(user.orgId, job.id, fileName);
    const arrayBuffer = await fileBlob.arrayBuffer();
    await uploadPrintDocument(
      user.orgId,
      storagePath,
      Buffer.from(arrayBuffer),
      fileMime ?? "application/pdf",
    );
  }

  return job;
}
