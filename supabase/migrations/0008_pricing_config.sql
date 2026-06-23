-- Pricing configuration (I-027, spec 0006). Moves the hardcoded discount + print
-- base-rate constants into per-org admin-editable config. DDL authority per
-- ADR-0015; lib/db/schema.ts is the TS query mirror. Sorts after 0000–0007.
--
-- Two tables:
--  - membership_tier_config: one row per {org, tier} — cafe + print discount %.
--  - org_print_pricing:       one row per org — BW/COLOR per-page base rate.
-- The seed (scripts/seed-supabase.ts) upserts current-behaviour rows; the
-- money paths read these instead of the lib/*/pricing.ts constants.

CREATE TABLE "membership_tier_config" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "tier" "MembershipTier" NOT NULL,
  "cafe_discount_pct" integer DEFAULT 0 NOT NULL,
  "print_discount_pct" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL,
  CONSTRAINT "membership_tier_config_pct_range" CHECK (
    "cafe_discount_pct" BETWEEN 0 AND 100 AND "print_discount_pct" BETWEEN 0 AND 100
  )
);

CREATE TABLE "org_print_pricing" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "bw_rate_per_page_rupiah" integer NOT NULL,
  "color_rate_per_page_rupiah" integer NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL,
  CONSTRAINT "org_print_pricing_positive" CHECK (
    "bw_rate_per_page_rupiah" > 0 AND "color_rate_per_page_rupiah" > 0
  )
);

CREATE UNIQUE INDEX "membership_tier_config_org_id_tier_idx" ON "membership_tier_config" USING btree ("org_id","tier");
CREATE INDEX "membership_tier_config_org_id_idx" ON "membership_tier_config" USING btree ("org_id");
CREATE UNIQUE INDEX "org_print_pricing_org_id_idx" ON "org_print_pricing" USING btree ("org_id");

-- RLS backstop (ADR-0015 §3) — org isolation; the server stays the authoritative gate.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['membership_tier_config','org_print_pricing'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO authenticated', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org())', t || '_org_isolation', t);
  END LOOP;
END $$;
