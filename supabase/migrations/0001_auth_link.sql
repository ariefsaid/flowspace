-- 0001_auth_link.sql
-- Supabase-owned platform wiring: org_id JWT claim helper + the app_users↔auth.users
-- link FK (ADR-0015 §2). Applied AFTER drizzle migrations (app tables must exist).
--
-- M-3: the FK is ENABLED — every non-null app_users.auth_user_id must reference a real
-- auth.users(id), and deleting the auth identity cascades to the profile row
-- (ON DELETE CASCADE). Keeps signup's create-user-then-insert-profile pairing honest.
ALTER TABLE app_users
  ADD CONSTRAINT app_users_auth_user_fk
  FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- Helper: reads org_id from the Supabase JWT claim (set as app_metadata.org_id at signup).
-- Stable so it may be inlined into RLS policy checks (Task 4.2, ADR-0015 §3).
CREATE OR REPLACE FUNCTION current_org()
  RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'org_id', '')
$$;
