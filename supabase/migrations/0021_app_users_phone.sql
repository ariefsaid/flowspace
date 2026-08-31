-- 0021_app_users_phone.sql
-- Signup UI parity (ORIG api/signup/route.ts): collects an optional phone
-- number. Nullable — existing rows and phone-less signups stay valid.
ALTER TABLE "public"."app_users" ADD COLUMN "phone" text;

-- Hot-path index (review FIX): listRecentOrdersByUser runs
-- WHERE org_id = ? AND customer_user_id = ? ORDER BY created_at DESC on every
-- member cafe page load. Matches the (org_id, user_id, created_at) pattern
-- bookings/print_jobs already use.
CREATE INDEX "cafe_orders_org_user_created_at_idx"
  ON "public"."cafe_orders" ("org_id", "customer_user_id", "created_at");
