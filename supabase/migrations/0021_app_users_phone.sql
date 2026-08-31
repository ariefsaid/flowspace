-- 0021_app_users_phone.sql
-- Signup UI parity (ORIG api/signup/route.ts): collects an optional phone
-- number. Nullable — existing rows and phone-less signups stay valid.
ALTER TABLE "public"."app_users" ADD COLUMN "phone" text;
