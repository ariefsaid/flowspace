-- Print storage hardening (I-023, security review FIX-FIRST).
-- 1. Widen the print-uploads bucket's allowed_mime_types to match the app's
--    accepted set (PDF/Word/Excel/PowerPoint/JPEG/PNG/TIFF) — they were narrower
--    (pdf/png/jpeg), so an app-accepted Word/Excel/etc. upload was rejected by
--    Storage AFTER the job was charged (orphan charged job). Aligning them closes that.
-- 2. Add print_jobs.storage_path so the uploaded document is referenceable
--    (upload now happens BEFORE the charge; the path is stored on the job).

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/tiff'
]
WHERE id = 'print-uploads';

ALTER TABLE "print_jobs" ADD COLUMN "storage_path" text;
