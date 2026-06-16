-- Down: 0002_rls_app_users
DROP POLICY IF EXISTS app_users_org_isolation ON app_users;
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE app_users FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE organizations FROM authenticated;
