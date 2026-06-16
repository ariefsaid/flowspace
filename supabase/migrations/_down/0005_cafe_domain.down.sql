-- Down for 0005_cafe_domain.sql (repo convention; NOT the CI path — CI is a fresh
-- `supabase db reset`). Reverse order: realtime → policies (dropped with tables) →
-- tables (CASCADE) → types.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cafe_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE cafe_orders;
  END IF;
END $$;

DROP TABLE IF EXISTS "cafe_order_items" CASCADE;
DROP TABLE IF EXISTS "cafe_orders" CASCADE;
DROP TABLE IF EXISTS "cafe_menu_items" CASCADE;
DROP TYPE IF EXISTS "public"."SugarLevel";
DROP TYPE IF EXISTS "public"."DrinkTemperature";
DROP TYPE IF EXISTS "public"."CafeOrderStatus";
DROP TYPE IF EXISTS "public"."CafeCategory";
