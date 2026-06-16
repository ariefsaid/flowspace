-- 0001_auth_link.sql
-- Supabase-owned platform wiring: org_id JWT claim helper + (deferred) auth FK (ADR-0015 §2).
-- Applied AFTER drizzle migrations (app tables must exist).
--
-- NOTE: The auth.users FK is added only after Phase 6 (full auth wiring) because the
-- integration tests mock the Supabase admin client and do not seed real auth.users rows.
-- Uncomment once the test suite connects to real Supabase Auth end-to-end.
--
-- ALTER TABLE app_users
--   ADD CONSTRAINT app_users_auth_user_fk
--   FOREIGN KEY (auth_user_id)
--   REFERENCES auth.users(id)
--   ON DELETE CASCADE;

-- Helper: reads org_id from the Supabase JWT claim (set as app_metadata.org_id at signup).
-- Stable so it may be inlined into RLS policy checks (Task 4.2, ADR-0015 §3).
CREATE OR REPLACE FUNCTION current_org()
  RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'org_id', '')
$$;
