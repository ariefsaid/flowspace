"use server";
/** Server action for member print submission. */
import { createId } from "@paralleldrive/cuid2";
import { requireSession } from "@/lib/auth/session";
import { submitPrintJob } from "@/lib/db/print";
import type { PrintColorMode } from "@/lib/db/enums";
import { getPdfPageCount } from "@/lib/print/document-pages";
import {
  parsePrintColorMode,
  parsePrintPaperSize,
  parseStrictBoolean,
  parseStrictPositiveInt,
  resolveDocumentPages,
} from "@/lib/print/validation";
import {
  uploadPrintDocument,
  deletePrintDocument,
  buildPrintStoragePath,
  validatePrintFile,
  validatePrintMagicBytes,
} from "@/lib/storage/uploads";

/**
 * Authenticate first, validate all metadata and bytes, upload into the
 * session-org prefix, then perform the atomic server-priced job submission.
 */
export async function submitPrintJobAction(input: FormData) {
  const user = await requireSession();

  const rawFile = input.get("file");
  if (!(rawFile instanceof Blob) || rawFile.size === 0) {
    throw new Error("FILE_REQUIRED");
  }
  const mimeType = rawFile.type;
  validatePrintFile(mimeType, rawFile.size);

  const suppliedFileName = (input.get("fileName") as string | null)?.trim();
  const blobFileName = "name" in rawFile && typeof rawFile.name === "string" ? rawFile.name : "";
  const fileName = suppliedFileName || blobFileName || "dokumen.pdf";
  const copies = parseStrictPositiveInt(input.get("copies") as string | null, "COPIES");
  const colorMode = parsePrintColorMode(input.get("colorMode") as string | null) as PrintColorMode;
  const paperSize = parsePrintPaperSize(input.get("paperSize") as string | null);
  const pageRange = ((input.get("pageRange") as string | null) ?? "all").trim();
  if (!pageRange) throw new Error("INVALID_PAGE_RANGE");
  const duplexRaw = input.get("duplex") as string | null;
  const duplex = duplexRaw === null ? false : parseStrictBoolean(duplexRaw);
  const documentPagesMetadata = input.get("documentPages") as string | null;

  const bytes = new Uint8Array(await rawFile.arrayBuffer());
  validatePrintMagicBytes(bytes, mimeType);
  const resolvedPages = resolveDocumentPages(mimeType, { documentPages: documentPagesMetadata });
  const documentPages = resolvedPages ?? (await getPdfPageCount(bytes));

  const documentId = createId();
  const storagePath = buildPrintStoragePath(user.orgId, documentId, fileName);
  await uploadPrintDocument(user.orgId, storagePath, bytes, mimeType);

  const printerIdValue = input.get("printerId");
  try {
    return await submitPrintJob({
      orgId: user.orgId,
      userId: user.id,
      fileName,
      pageRange,
      documentPages,
      printerId: typeof printerIdValue === "string" && printerIdValue ? printerIdValue : undefined,
      copies,
      colorMode,
      paperSize,
      duplex,
      storagePath,
    });
  } catch (error) {
    // Best-effort cleanup of the just-uploaded blob so a failed submit never
    // leaves an orphaned Storage object. Never mask the original error.
    try {
      await deletePrintDocument(storagePath);
    } catch {
      // ignore cleanup failure — the original submit error is what matters
    }
    throw error;
  }
}
