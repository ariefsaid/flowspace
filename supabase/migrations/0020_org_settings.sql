-- Org-scoped config store for non-CRUD admin settings (I-042, spec TBD):
-- site/SEO/theme, Google Analytics, email, UniFi controller. One row per
-- (org_id, category); the jsonb `settings` blob holds that category's free-
-- form config. SELECT-only to `authenticated` (I-046/ADR-0015 addendum
-- convention) — all writes go through the server's service-role connection,
-- the RLS policy below is defense-in-depth only.
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

GRANT SELECT ON TABLE "public"."org_settings" TO authenticated;
ALTER TABLE "public"."org_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_settings_org_isolation" ON "public"."org_settings"
  FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org());
