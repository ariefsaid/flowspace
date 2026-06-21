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
 * @param path - Object path within the bucket.
 * @returns    A signed URL valid for `SIGNED_URL_TTL_SECONDS`.
 */
export async function getSignedDownloadUrl(path: string): Promise<string> {
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
