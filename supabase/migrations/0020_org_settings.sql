-- Org-scoped config store for non-CRUD admin settings (I-042, spec TBD):
-- site/SEO/theme, Google Analytics, email, UniFi controller. One row per
-- (org_id, category); the jsonb `settings` blob holds that category's free-
-- form config — including UniFi controller credentials (siteManagerApiKey /
-- password) under the "unifi" category. Server-only, NO Data-API grant at
-- all (same pattern as print_agent_configs, 0012): the table is read ONLY
-- server-side (RSC -> getOrgSettings on the service-role connection), so
-- `authenticated` never legitimately needs it, and a SELECT grant would let
-- any member read another category's secrets via the Data API. RLS stays
-- enabled + org-scoped as defense-in-depth for any future grant, but with no
-- GRANT at all `authenticated` has zero privileges on this table.
CREATE TABLE "public"."org_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "category" text NOT NULL,
  "settings" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);
CREATE INDEX "org_settings_org_id_idx" ON "public"."org_settings" USING btree ("org_id");
CREATE UNIQUE INDEX "org_settings_org_id_category_key" ON "public"."org_settings" USING btree ("org_id", "category");

ALTER TABLE "public"."org_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_settings_org_isolation" ON "public"."org_settings"
  FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org());
