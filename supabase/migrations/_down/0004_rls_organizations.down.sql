-- Down: 0004_rls_organizations
DROP POLICY IF EXISTS organizations_org_isolation ON organizations;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
