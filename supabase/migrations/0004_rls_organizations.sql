-- 0004_rls_organizations.sql
-- M-2: `organizations` was GRANTed to the `authenticated` role (0002) with NO
-- row-level security — an authenticated request could read EVERY org row, not
-- just its own. Enable RLS + an org-scoped policy so a scoped connection sees
-- only the org in its JWT claim (defense-in-depth; the server still connects
-- privileged as the postgres/service-role which bypasses RLS).
--
-- Applied AFTER 0001 (current_org()) + 0002 (the authenticated GRANT).
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_org_isolation ON organizations
  FOR ALL
  TO authenticated
  USING (id = current_org())
  WITH CHECK (id = current_org());
