-- Cafe domain DDL (I-022). DDL authority per ADR-0015; lib/db/schema.ts is the
-- TS query mirror kept in lockstep. Sorts after 0000–0004 (references
-- organizations + app_users + current_org()).

CREATE TYPE "public"."CafeCategory" AS ENUM ('COFFEE', 'NON_COFFEE', 'FOOD', 'SNACK');
CREATE TYPE "public"."CafeOrderStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
CREATE TYPE "public"."DrinkTemperature" AS ENUM ('HOT', 'COLD', 'ICE_BLENDED');
CREATE TYPE "public"."SugarLevel" AS ENUM ('NORMAL', 'LESS', 'NONE');

CREATE TABLE "cafe_menu_items" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "name" text NOT NULL,
  "emoji" text NOT NULL,
  "category" "CafeCategory" NOT NULL,
  "price_rupiah" integer NOT NULL,
  "description" text NOT NULL,
  "has_variants" boolean DEFAULT false NOT NULL,
  "available" boolean DEFAULT true NOT NULL,
  "archived_at" timestamp (3),
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);
CREATE TABLE "cafe_orders" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "code" text NOT NULL,
  "customer_user_id" text,
  "guest_name" text,
  "status" "CafeOrderStatus" DEFAULT 'NEW' NOT NULL,
  "subtotal_rupiah" integer NOT NULL,
  "discount_rupiah" integer DEFAULT 0 NOT NULL,
  "total_rupiah" integer NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);
CREATE TABLE "cafe_order_items" (
  "id" text PRIMARY KEY NOT NULL,
  "order_id" text NOT NULL,
  "menu_item_id" text,
  "name_snapshot" text NOT NULL,
  "qty" integer NOT NULL,
  "unit_price_rupiah" integer NOT NULL,
  "temperature" "DrinkTemperature",
  "sugar" "SugarLevel"
);

ALTER TABLE "cafe_menu_items" ADD CONSTRAINT "cafe_menu_items_org_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cafe_orders" ADD CONSTRAINT "cafe_orders_org_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cafe_orders" ADD CONSTRAINT "cafe_orders_customer_user_id_fk"
  FOREIGN KEY ("customer_user_id") REFERENCES "public"."app_users" ("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "cafe_order_items" ADD CONSTRAINT "cafe_order_items_order_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."cafe_orders" ("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cafe_order_items" ADD CONSTRAINT "cafe_order_items_menu_item_id_fk"
  FOREIGN KEY ("menu_item_id") REFERENCES "public"."cafe_menu_items" ("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "cafe_menu_items_org_id_idx" ON "cafe_menu_items" USING btree ("org_id");
CREATE INDEX "cafe_menu_items_org_id_category_idx" ON "cafe_menu_items" USING btree ("org_id", "category");
CREATE UNIQUE INDEX "cafe_orders_org_id_code_key" ON "cafe_orders" USING btree ("org_id", "code");
CREATE INDEX "cafe_orders_org_id_idx" ON "cafe_orders" USING btree ("org_id");
CREATE INDEX "cafe_orders_org_id_status_idx" ON "cafe_orders" USING btree ("org_id", "status");
CREATE INDEX "cafe_orders_org_id_created_at_idx" ON "cafe_orders" USING btree ("org_id", "created_at");
CREATE INDEX "cafe_order_items_order_id_idx" ON "cafe_order_items" USING btree ("order_id");

-- RLS backstop (ADR-0015 §3) — defense-in-depth; the server (postgres/service-role
-- via lib/db/drizzle.ts) bypasses RLS and stays the authoritative gate. Guests have
-- no JWT: their order insert is performed server-side privileged (see Phase D), so
-- these authenticated-role policies do NOT gate the guest path.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cafe_menu_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cafe_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cafe_order_items TO authenticated;

ALTER TABLE cafe_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY cafe_menu_items_org_isolation ON cafe_menu_items
  FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org());
CREATE POLICY cafe_orders_org_isolation ON cafe_orders
  FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org());
-- cafe_order_items has no org_id; scope via its parent order's org.
CREATE POLICY cafe_order_items_org_isolation ON cafe_order_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM cafe_orders o WHERE o.id = order_id AND o.org_id = current_org()))
  WITH CHECK (EXISTS (SELECT 1 FROM cafe_orders o WHERE o.id = order_id AND o.org_id = current_org()));

-- Realtime (OQ-4) — publish cafe_orders so the barista KDS receives postgres-changes
-- events. Guarded: the local stack may already create an empty supabase_realtime
-- publication, so add idempotently to keep `supabase db reset` deterministic. Realtime
-- respects the RLS policy above for the authenticated role (no cross-org row leak).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cafe_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cafe_orders;
  END IF;
END $$;
