-- Print parity core (I-043, spec 0009). DDL authority per ADR-0015;
-- lib/db/schema.ts is the TS query mirror. Sorts after 0000–0009.
--
-- Transform print pricing from one flat row per org into one row per
-- (org_id, color_mode, paper_size) matrix, add the COMPLETE job lifecycle,
-- and introduce org-scoped printers + agent-key configuration + a shared
-- rate-limit event table. Legacy data is preserved: the old flat table is
-- renamed (not dropped), given A4 rows are mapped into the matrix, missing
-- A3/F4 cells are seeded, and historic jobs are backfilled with
-- page_range='all' and total_pages=pages×copies. No job is ever deleted.
--
-- Additive + idempotent-friendly: safe to re-run on a fresh `db reset`.

-- 1. Extend the job lifecycle enum.
ALTER TYPE "public"."PrintJobStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "public"."PrintJobStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- 2. Pricing: rename the legacy flat table; create the matrix.
ALTER TABLE "public"."org_print_pricing" RENAME TO "org_print_pricing_legacy";

CREATE TABLE "public"."org_print_pricing" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "color_mode" "public"."PrintColorMode" NOT NULL,
  "paper_size" text NOT NULL,
  "price_per_page_rupiah" integer NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL,
  CONSTRAINT "org_print_pricing_matrix_paper_check" CHECK (
    "paper_size" IN ('A4','A3','F4')
  ),
  CONSTRAINT "org_print_pricing_positive" CHECK ("price_per_page_rupiah" > 0)
);

CREATE UNIQUE INDEX "org_print_pricing_matrix_org_mode_paper_idx"
  ON "org_print_pricing" USING btree ("org_id","color_mode","paper_size");
CREATE INDEX "org_print_pricing_org_lookup_idx" ON "org_print_pricing" USING btree ("org_id");

-- Backfill matrix rows from the legacy flat row (preserve A4 BW/COLOR values).
INSERT INTO "org_print_pricing" ("id","org_id","color_mode","paper_size","price_per_page_rupiah","is_active")
SELECT gen_random_uuid()::text, "org_id", 'BW', 'A4', "bw_rate_per_page_rupiah", true
  FROM "org_print_pricing_legacy"
ON CONFLICT ("org_id","color_mode","paper_size") DO NOTHING;
INSERT INTO "org_print_pricing" ("id","org_id","color_mode","paper_size","price_per_page_rupiah","is_active")
SELECT gen_random_uuid()::text, "org_id", 'COLOR', 'A4', "color_rate_per_page_rupiah", true
  FROM "org_print_pricing_legacy"
ON CONFLICT ("org_id","color_mode","paper_size") DO NOTHING;

-- Seed missing A3/F4 cells for any org (incl. an org that had no legacy row).
INSERT INTO "org_print_pricing" ("id","org_id","color_mode","paper_size","price_per_page_rupiah","is_active")
SELECT gen_random_uuid()::text, "org_id", m, p, n, true
FROM (
  SELECT DISTINCT "org_id" FROM "org_print_pricing_legacy"
  UNION SELECT "id" FROM "public"."organizations"
) o, (VALUES ('BW'::"public"."PrintColorMode",'A3',1000),('BW','F4',600),('COLOR','A3',4000),('COLOR','F4',2500)) AS cell(m,p,n)
ON CONFLICT ("org_id","color_mode","paper_size") DO NOTHING;

-- 3. Printers (org-scoped).
CREATE TABLE "public"."printers" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "display_name" text NOT NULL,
  "location" text,
  "printer_type" text DEFAULT 'LASER' NOT NULL,
  "color_support" boolean DEFAULT false NOT NULL,
  "paper_sizes" text[] DEFAULT ARRAY['A4']::text[] NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "archived_at" timestamp (3),
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL,
  CONSTRAINT "printers_type_check" CHECK ("printer_type" IN ('LASER','INKJET')),
  CONSTRAINT "printers_name_check" CHECK (length("name") > 0),
  CONSTRAINT "printers_display_name_check" CHECK (length("display_name") > 0)
);

CREATE UNIQUE INDEX "printers_org_id_name_key" ON "printers" USING btree ("org_id","name");
CREATE INDEX "printers_org_id_idx" ON "printers" USING btree ("org_id");
-- At most one non-archived default per org (concurrent-safe invariant).
CREATE UNIQUE INDEX "printers_org_single_default_idx"
  ON "printers" USING btree ("org_id") WHERE ("is_default" AND "archived_at" IS NULL);

-- 4. Print-agent key configuration (no raw key persisted).
CREATE TABLE "public"."print_agent_configs" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL UNIQUE REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "key_selector" text NOT NULL UNIQUE,
  "key_hash" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "server_name" text,
  "last_seen_at" timestamp (3),
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);

-- 5. Shared rate-limit event table (sliding window; multiprocess-safe).
CREATE TABLE "public"."print_agent_rate_limit_events" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "config_id" text NOT NULL REFERENCES "public"."print_agent_configs"("id") ON DELETE cascade,
  "requested_at" timestamp (3) DEFAULT now() NOT NULL
);
CREATE INDEX "print_agent_rate_limit_events_config_time_idx"
  ON "print_agent_rate_limit_events" USING btree ("config_id","requested_at");
CREATE INDEX "print_agent_rate_limit_events_org_id_idx"
  ON "print_agent_rate_limit_events" USING btree ("org_id");

-- 6. Extend print_jobs with the range/lifecycle/printer fields (nullable so a
--    straight upgrade never blocks on pre-existing rows; the repository always
--    writes real values and the backfill below fills historic rows).
ALTER TABLE "public"."print_jobs"
  ADD COLUMN "page_range" text DEFAULT 'all',
  ADD COLUMN "total_pages" integer,
  ADD COLUMN "printer_id" text REFERENCES "public"."printers"("id") ON DELETE RESTRICT,
  ADD COLUMN "error_message" text,
  ADD COLUMN "processed_by" text,
  ADD COLUMN "processed_at" timestamp (3),
  ADD COLUMN "completed_at" timestamp (3);

-- Backfill historic jobs: effective pages = pages × copies; range = 'all'.
UPDATE "public"."print_jobs"
SET "page_range" = COALESCE("page_range", 'all'),
    "total_pages" = COALESCE("total_pages", "pages" * "copies");

ALTER TABLE "public"."print_jobs"
  ADD CONSTRAINT "print_jobs_total_pages_positive" CHECK ("total_pages" IS NULL OR "total_pages" > 0);

CREATE INDEX "print_jobs_org_id_status_created_at_idx"
  ON "public"."print_jobs" USING btree ("org_id","status","created_at");
CREATE INDEX "print_jobs_printer_id_idx" ON "public"."print_jobs" USING btree ("printer_id");

-- 7. RLS backstop (ADR-0015 §3) — org isolation; the server stays authoritative.
-- SELECT-only grant (I-046 / ADR-0015 addendum): these are all NEW physical
-- tables (org_print_pricing is renamed+recreated above, not the pre-existing
-- relation), so they start with no client write DML rather than inheriting
-- I-046's revoke. All writes go through the server's service-role connection;
-- the FOR ALL policy below is defense-in-depth only (RLS never grants beyond
-- what GRANT allows).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_print_pricing','printers'] LOOP
    EXECUTE format('GRANT SELECT ON TABLE %I TO authenticated', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org())', t || '_org_isolation', t);
  END LOOP;

  -- print_agent_configs / print_agent_rate_limit_events are server-only
  -- (the admin print-server page reads them via the service-role
  -- connection, never the browser client): NO Data-API grant at all —
  -- not even SELECT of key_hash/key_selector — so `authenticated` has zero
  -- privileges on these two. RLS is still enabled + org-scoped as
  -- defense-in-depth for any future grant, but no GRANT means no access.
  FOREACH t IN ARRAY ARRAY['print_agent_configs','print_agent_rate_limit_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org())', t || '_org_isolation', t);
  END LOOP;
END $$;