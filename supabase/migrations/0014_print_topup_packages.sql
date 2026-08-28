-- Print-balance packages (I-043, spec 0009).
CREATE TABLE "public"."print_topup_packages" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "pages" integer NOT NULL,
  "price_rupiah" integer NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "archived_at" timestamp (3),
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL,
  CONSTRAINT "print_topup_packages_pages_check" CHECK ("pages" > 0 AND "pages" <= 2147483647),
  CONSTRAINT "print_topup_packages_price_check" CHECK ("price_rupiah" > 0 AND "price_rupiah" <= 2147483647)
);
CREATE INDEX "print_topup_packages_org_id_idx" ON "public"."print_topup_packages" USING btree ("org_id");
CREATE UNIQUE INDEX "print_topup_packages_org_pages_key" ON "public"."print_topup_packages" USING btree ("org_id", "pages");

INSERT INTO "public"."print_topup_packages" ("id", "org_id", "pages", "price_rupiah", "sort_order")
SELECT "id" || '__print-topup-10', "id", 10, 10000, 1 FROM "public"."organizations"
UNION ALL
SELECT "id" || '__print-topup-50', "id", 50, 45000, 2 FROM "public"."organizations"
UNION ALL
SELECT "id" || '__print-topup-100', "id", 100, 80000, 3 FROM "public"."organizations";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."print_topup_packages" TO authenticated;
ALTER TABLE "public"."print_topup_packages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "print_topup_packages_org_isolation" ON "public"."print_topup_packages"
  FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org());

ALTER TABLE "public"."transactions"
  ADD COLUMN "print_topup_package_id" text REFERENCES "public"."print_topup_packages"("id") ON DELETE SET NULL;
CREATE INDEX "transactions_org_id_print_topup_package_idx"
  ON "public"."transactions" USING btree ("org_id", "print_topup_package_id");
