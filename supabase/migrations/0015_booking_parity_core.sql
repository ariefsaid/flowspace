-- I-040 booking parity overhaul (spec 0007) — core schema.
-- Adds the SCHEDULED/WALKIN booking mode, facility catalog columns
-- (capacity/seat_label/zone/max_hours_cap), booking payment-method fields,
-- expiring time-credit lots, and the availability composite index. DDL
-- authority per ADR-0015; lib/db/schema.ts is the Drizzle TS query mirror
-- kept in lockstep.
--
-- The BookingStatus PENDING/CONFIRMED values and the FacilityType FULL_ROOM
-- value are added in the PRECEDING migration (0014), not here: Postgres
-- forbids using a value just added via `ALTER TYPE ... ADD VALUE` later in
-- the SAME transaction ("unsafe use of new value"), and this migration's
-- `SET DEFAULT 'PENDING'` needs that value already committed.

CREATE TYPE "public"."BookingMode" AS ENUM ('SCHEDULED','WALKIN');
CREATE TYPE "public"."BookingPaymentMethod" AS ENUM ('time_credits','online','cashier');

ALTER TABLE "bookings"
  ADD COLUMN "booking_mode" "BookingMode" NOT NULL DEFAULT 'WALKIN',
  ADD COLUMN "base_amount_rupiah" integer NOT NULL DEFAULT 0,
  ADD COLUMN "discount_rupiah" integer NOT NULL DEFAULT 0,
  ADD COLUMN "payment_method" "BookingPaymentMethod";

UPDATE "bookings" SET "booking_mode" = CASE
  WHEN "facility_type" IN ('COWORKING_SEAT','MEETING_ROOM') THEN 'SCHEDULED'::"BookingMode"
  ELSE 'WALKIN'::"BookingMode" END;

ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mode_facility"
  CHECK ("booking_mode" = 'WALKIN' OR "facility_id" IS NOT NULL);

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_money_duration";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_money_duration" CHECK (
  "rate_per_hour_rupiah" >= 0 AND "amount_rupiah" >= 0
  AND "base_amount_rupiah" >= 0 AND "discount_rupiah" >= 0
  AND ("duration_hours" IS NULL OR "duration_hours" >= 0)
);

CREATE INDEX "bookings_org_facility_status_time_idx"
  ON "bookings" USING btree ("org_id","facility_id","status","start_at","end_at");

ALTER TABLE "facilities"
  ADD COLUMN "capacity" integer,
  ADD COLUMN "seat_label" text,
  ADD COLUMN "zone" text,
  ADD COLUMN "max_hours_cap" integer;
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_capacity_nonneg"
  CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_max_hours_cap_nonneg"
  CHECK ("max_hours_cap" IS NULL OR "max_hours_cap" > 0);

ALTER TABLE "transactions" ADD COLUMN "payment_method" text;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_method_known"
  CHECK ("payment_method" IS NULL OR "payment_method" IN ('cash','qris','time_credits','online'));

CREATE TABLE "time_credit_lots" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "public"."app_users"("id") ON DELETE cascade,
  "package_id" text REFERENCES "public"."time_credit_packages"("id") ON DELETE set null,
  "purchase_transaction_id" text REFERENCES "public"."transactions"("id") ON DELETE set null,
  "total_hours" integer NOT NULL,
  "remaining_hours" integer NOT NULL,
  "purchased_at" timestamp (3) DEFAULT now() NOT NULL,
  "expires_at" timestamp (3) NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);
ALTER TABLE "time_credit_lots" ADD CONSTRAINT "time_credit_lots_remaining"
  CHECK ("total_hours" > 0 AND "remaining_hours" >= 0 AND "remaining_hours" <= "total_hours");
CREATE INDEX "time_credit_lots_org_id_idx" ON "time_credit_lots" USING btree ("org_id");
CREATE INDEX "time_credit_lots_org_user_expires_idx" ON "time_credit_lots" USING btree ("org_id","user_id","expires_at");
CREATE INDEX "time_credit_lots_user_expires_idx" ON "time_credit_lots" USING btree ("user_id","expires_at");

-- SELECT-only (I-046 / ADR-0015 addendum) — all writes go through the
-- server's service-role connection; the FOR ALL policy below is
-- defense-in-depth only (RLS never grants beyond what GRANT allows).
GRANT SELECT ON TABLE "time_credit_lots" TO authenticated;
ALTER TABLE "time_credit_lots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_credit_lots_org_isolation" ON "time_credit_lots" FOR ALL TO authenticated
  USING ("org_id" = current_org()) WITH CHECK ("org_id" = current_org());
