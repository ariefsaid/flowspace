/**
 * Storage seam — print-uploads bucket (Task 4.4, ADR-0013).
 *
 * Provides:
 *  - Pure helpers (path builder + MIME/size validator) — import anywhere, no side-effects.
 *  - Server-only upload/download/delete wrappers via the admin (service-role) client.
 *
 * All write calls use the admin client: the server is the only writer for print
 * documents; RLS on the bucket is enforced separately (ADR-0013 server-authoritative
 * rule). Never call the upload/delete functions from a client bundle.
 *
 * Security ([SEC]):
 *  - Paths are always prefixed with `orgId` — cross-org access is impossible via path.
 *  - `validatePrintFile` enforces an allowlist of MIME types + a hard size cap before
 *    any bytes are handed to Storage; call it server-side before uploading.
 *  - The `contentType` stored with the object is derived server-side from the
 *    validated MIME — the client cannot influence what the bucket advertises.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "print-uploads";

/** Signed URL validity — 60 minutes (generous for print queues). */
const SIGNED_URL_TTL_SECONDS = 3600;

// ---------------------------------------------------------------------------
// MIME + size constants (exported for tests + the server action)
// ---------------------------------------------------------------------------

/**
 * Allowlist of MIME types the print flow accepts.
 * Matches the UI hint: PDF, Word, Excel, PowerPoint, JPG, PNG, TIFF.
 */
export const ALLOWED_PRINT_MIME_TYPES: readonly string[] = [
  "application/pdf",
  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Images
  "image/jpeg",
  "image/png",
  "image/tiff",
] as const;

/**
 * Hard file-size cap: 10 MB (matches the Storage bucket limit in 0003_storage_bucket.sql).
 */
export const MAX_PRINT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Pure helpers (no side-effects — safe to import anywhere)
// ---------------------------------------------------------------------------

/**
 * Build the org-scoped Storage path for a print document.
 *
 * Shape: `<orgId>/print/<jobId>/<safeFileName>`
 *
 * The path is fully deterministic from (orgId, jobId, fileName), so it can be
 * re-derived server-side without a separate DB column.
 *
 * [SEC]: orgId is always the first path segment — cross-org traversal is impossible.
 *
 * @param orgId    - Org the document belongs to (server-derived, never client-supplied).
 * @param jobId    - The print job's UUID (returned by submitPrintJob).
 * @param fileName - Original file name from the member. Sanitised before use.
 */
export function buildPrintStoragePath(
  orgId: string,
  jobId: string,
  fileName: string,
): string {
  // Strip path-traversal characters and leading slashes, then truncate.
  const safe = fileName
    .replace(/\.\./g, "") // remove traversal sequences
    .replace(/^[/\\]+/, "") // strip leading slashes/backslashes
    .replace(/[/\\]/g, "_") // replace remaining separators with _
    .slice(0, 200) // cap length
    || "document";

  return `${orgId}/print/${jobId}/${safe}`;
}

// ---------------------------------------------------------------------------
// Magic-byte signatures for content-type validation [SEC]
// ---------------------------------------------------------------------------

/**
 * Map of MIME type prefixes to their required leading byte sequences.
 * Only the MIME types in ALLOWED_PRINT_MIME_TYPES that have a known signature
 * are listed here. Types without a known signature are not blocked.
 */
const MAGIC_BYTE_SIGNATURES: ReadonlyMap<string, readonly number[][]> = new Map([
  ["application/pdf", [[0x25, 0x50, 0x44, 0x46]]],          // %PDF
  ["image/png", [[0x89, 0x50, 0x4e, 0x47]]],                 // .PNG
  ["image/jpeg", [[0xff, 0xd8, 0xff]]],                       // JFIF/EXIF
  ["image/tiff", [
    [0x49, 0x49, 0x2a, 0x00],                                 // II*\0 (little-endian)
    [0x4d, 0x4d, 0x00, 0x2a],                                 // MM\0* (big-endian)
  ]],
  // OpenXML formats (docx/xlsx/pptx) share the ZIP container signature
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    [[0x50, 0x4b]]],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    [[0x50, 0x4b]]],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation",
    [[0x50, 0x4b]]],
  // Legacy Office formats share the OLE2 compound document signature
  ["application/msword",          [[0xd0, 0xcf, 0x11, 0xe0]]],
  ["application/vnd.ms-excel",    [[0xd0, 0xcf, 0x11, 0xe0]]],
  ["application/vnd.ms-powerpoint", [[0xd0, 0xcf, 0x11, 0xe0]]],
]);

/**
 * Validate that a file's leading bytes match the claimed MIME type.
 *
 * Throws `Error("INVALID_FILE_CONTENT")` when the bytes do NOT match any
 * known signature for the given MIME type. If the MIME type has no registered
 * signature the function passes silently (unknown → don't block).
 *
 * [SEC]: call this server-side, after reading the raw bytes and before passing
 * the file to Storage, to prevent MIME-spoofing (a client claiming "image/png"
 * while uploading a shell script, etc.).
 *
 * @param buffer   - The raw file bytes (at least the first few bytes suffice,
 *                   but a full Buffer / Uint8Array is fine).
 * @param mimeType - The declared content type from the uploaded Blob.
 */
export function validatePrintMagicBytes(
  buffer: Buffer | Uint8Array,
  mimeType: string,
): void {
  const signatures = MAGIC_BYTE_SIGNATURES.get(mimeType);
  if (!signatures) return; // unknown MIME — no signature to check, pass

  const matches = signatures.some((sig) =>
    sig.every((byte, i) => buffer[i] === byte),
  );
  if (!matches) throw new Error("INVALID_FILE_CONTENT");
}

/**
 * Validate a print file's MIME type and size before upload.
 *
 * Throws a sentinel string on failure — the server action maps these to HTTP errors.
 *
 * [SEC]: called server-side before any bytes are handed to Storage.
 *
 * @param mimeType  - Content-type string (from the uploaded File object on the server).
 * @param sizeBytes - File size in bytes.
 */
export function validatePrintFile(mimeType: string, sizeBytes: number): void {
  if (!mimeType || !ALLOWED_PRINT_MIME_TYPES.includes(mimeType)) {
    throw new Error("INVALID_FILE_TYPE");
  }
  if (sizeBytes > MAX_PRINT_FILE_SIZE_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
}

// ---------------------------------------------------------------------------
// Server-only Storage wrappers (admin client — service-role key)
// ---------------------------------------------------------------------------

/**
 * Upload a print document to the private `print-uploads` bucket.
 *
 * [SEC]:
 *  - Use `buildPrintStoragePath` to derive the path (org-scoped).
 *  - Call `validatePrintFile` before calling this function.
 *  - `contentType` must be the server-validated MIME, not a client header.
 *
 * @param path        - Object path within the bucket (use `buildPrintStoragePath`).
 * @param file        - Raw file bytes (Buffer or Uint8Array).
 * @param contentType - Validated MIME type (e.g. "application/pdf").
 */
export async function uploadPrintDocument(
  orgId: string,
  path: string,
  file: Buffer | Uint8Array,
  contentType = "application/pdf",
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType,
      upsert: true,
      metadata: { orgId },
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

/**
 * Get a short-lived signed download URL for a private print document.
 *
 * [SEC]: the caller passes the server-derived `orgId`; the path MUST be inside
 * that org's prefix (`<orgId>/…`). This prevents a cross-org storage IDOR when a
 * download surface is wired — a path from another org throws before any signing.
 *
 * @param orgId - Server-derived org of the caller (never client-supplied).
 * @param path  - Object path within the bucket (from buildPrintStoragePath).
 * @returns       A signed URL valid for `SIGNED_URL_TTL_SECONDS`.
 */
export async function getSignedDownloadUrl(orgId: string, path: string): Promise<string> {
  // Self-defending: reject traversal AND require the org prefix, so the guard
  // holds even if a future caller passes a path not freshly built here.
  if (!orgId || path.includes("..") || !path.startsWith(`${orgId}/`)) {
    throw new Error("FORBIDDEN_PATH");
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(`Storage signed URL failed: ${error?.message ?? "no URL returned"}`);
  }
  return data.signedUrl;
}

/**
 * Delete a print document from the bucket (cleanup / re-upload path).
 *
 * @param path - Object path within the bucket.
 */
export async function deletePrintDocument(path: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
