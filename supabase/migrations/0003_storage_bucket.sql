-- 0003_storage_bucket.sql
-- Creates the print-uploads private bucket for FUTURE print billing uploads (Task 4.4).
-- Seam only — no print domain logic in I-005.
--
-- storage.buckets is managed by the Supabase Storage service; the `storage` schema
-- is owned by Supabase so this lives in supabase/migrations (ADR-0015 §2).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'print-uploads',
  'print-uploads',
  false,                         -- private bucket: requires signed URLs for access
  10485760,                      -- 10 MB per file (generous for print PDFs)
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;    -- idempotent re-apply
