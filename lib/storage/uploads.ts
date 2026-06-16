/**
 * Storage seam — print-uploads bucket (Task 4.4, ADR-0013).
 *
 * Scaffold only: no print billing domain — just the infrastructure seam.
 * The print billing surface will use these functions once it is built.
 *
 * All calls use the admin (service-role) client: the server is the only
 * writer for print documents; RLS on the bucket is enforced separately
 * (ADR-0013 server-authoritative rule). Never call these functions from
 * a client bundle.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "print-uploads";
/** Signed URL validity — 60 minutes (generous for print queues). */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Upload a print document to the private `print-uploads` bucket.
 *
 * @param orgId   - Org the document belongs to (used as path prefix for isolation).
 * @param path    - Object path within the bucket (e.g. `<orgId>/invoice-123.pdf`).
 * @param file    - Raw file bytes (Buffer or Uint8Array).
 */
export async function uploadPrintDocument(
  orgId: string,
  path: string,
  file: Buffer | Uint8Array
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: "application/pdf",
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
