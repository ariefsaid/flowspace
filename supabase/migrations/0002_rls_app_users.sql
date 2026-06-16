-- 0002_rls_app_users.sql
-- RLS org-isolation backstop on app_users (ADR-0015 §3).
-- The server (postgres superuser / service-role key) is the authoritative gate;
-- RLS is defense-in-depth: a scoped (authenticated) role sees ONLY its own org's rows.

-- Grant table access to the authenticated role (Supabase JWT role for logged-in users).
-- The service-role key bypasses RLS and connects as postgres, so it is unaffected.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE organizations TO authenticated;

-- Enable RLS on the business table.
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Org-isolation policy: authenticated requests may only see/modify rows in
-- their own org (org_id from the JWT claim via current_org(), set in 0001).
CREATE POLICY app_users_org_isolation ON app_users
  FOR ALL
  TO authenticated
  USING (org_id = current_org())
  WITH CHECK (org_id = current_org());
