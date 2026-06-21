-- Down for 0007_print_storage.sql (repo convention; CI is a fresh reset).
ALTER TABLE "print_jobs" DROP COLUMN IF EXISTS "storage_path";
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg']
WHERE id = 'print-uploads';
