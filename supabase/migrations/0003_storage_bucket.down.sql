-- Down: 0003_storage_bucket
-- WARNING: this deletes the bucket AND all objects in it. Only run in dev/CI.
DELETE FROM storage.buckets WHERE id = 'print-uploads';
