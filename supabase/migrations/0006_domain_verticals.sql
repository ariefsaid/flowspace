-- Domain verticals DDL (I-020 packages, I-021 booking, I-023 print, unified
-- transactions ledger). DDL authority per ADR-0015; lib/db/schema.ts is the TS
-- query mirror. Sorts after 0000–0005. Balances stay on app_users
-- (time_credits / print_balance) — no separate balance table.

CREATE TYPE "public"."BookingFacilityType" AS ENUM ('WALKIN_COWORKING','WALKIN_MEETING','COWORKING_SEAT','MEETING_ROOM','FULL_ROOM');
CREATE TYPE "public"."BookingStatus" AS ENUM ('ACTIVE','COMPLETED','CANCELLED');
CREATE TYPE "public"."BookingPaymentStatus" AS ENUM ('WAITING_CASHIER','PAID_CASHIER','PAID_ONLINE','PENDING');
CREATE TYPE "public"."FacilityType" AS ENUM ('COWORKING_SEAT','MEETING_ROOM');
CREATE TYPE "public"."PrintColorMode" AS ENUM ('BW','COLOR');
CREATE TYPE "public"."PrintJobStatus" AS ENUM ('PENDING','READY','COMPLETED');
CREATE TYPE "public"."TransactionType" AS ENUM ('PACKAGE_PURCHASE','CAFE_ORDER','PRINT_JOB','BOOKING','PRINT_TOPUP');
CREATE TYPE "public"."TransactionStatus" AS ENUM ('COMPLETED','PENDING');

CREATE TABLE "time_credit_packages" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "hours" integer NOT NULL,
  "price_rupiah" integer NOT NULL,
  "price_per_hour_rupiah" integer NOT NULL,
  "popular" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "archived_at" timestamp (3),
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "facilities" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "type" "FacilityType" NOT NULL,
  "rate_per_hour_rupiah" integer NOT NULL,
  "available" boolean DEFAULT true NOT NULL,
  "archived_at" timestamp (3),
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "bookings" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "public"."app_users"("id") ON DELETE cascade,
  "facility_type" "BookingFacilityType" NOT NULL,
  "facility_id" text REFERENCES "public"."facilities"("id") ON DELETE set null,
  "facility_name" text NOT NULL,
  "start_at" timestamp (3) DEFAULT now() NOT NULL,
  "end_at" timestamp (3),
  "duration_hours" integer,
  "rate_per_hour_rupiah" integer NOT NULL,
  "amount_rupiah" integer DEFAULT 0 NOT NULL,
  "status" "BookingStatus" DEFAULT 'ACTIVE' NOT NULL,
  "payment_status" "BookingPaymentStatus" DEFAULT 'WAITING_CASHIER' NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "print_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "public"."app_users"("id") ON DELETE cascade,
  "file_name" text NOT NULL,
  "pages" integer NOT NULL,
  "copies" integer DEFAULT 1 NOT NULL,
  "color_mode" "PrintColorMode" DEFAULT 'BW' NOT NULL,
  "paper_size" text DEFAULT 'A4' NOT NULL,
  "duplex" boolean DEFAULT false NOT NULL,
  "price_per_page_rupiah" integer NOT NULL,
  "discount_rupiah" integer DEFAULT 0 NOT NULL,
  "total_rupiah" integer NOT NULL,
  "status" "PrintJobStatus" DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade,
  "user_id" text REFERENCES "public"."app_users"("id") ON DELETE set null,
  "type" "TransactionType" NOT NULL,
  "description" text NOT NULL,
  "amount_rupiah" integer NOT NULL,
  "discount_rupiah" integer DEFAULT 0 NOT NULL,
  "status" "TransactionStatus" DEFAULT 'COMPLETED' NOT NULL,
  "cafe_order_id" text REFERENCES "public"."cafe_orders"("id") ON DELETE set null,
  "booking_id" text REFERENCES "public"."bookings"("id") ON DELETE set null,
  "print_job_id" text REFERENCES "public"."print_jobs"("id") ON DELETE set null,
  "package_id" text REFERENCES "public"."time_credit_packages"("id") ON DELETE set null,
  "created_at" timestamp (3) DEFAULT now() NOT NULL
);

CREATE INDEX "time_credit_packages_org_id_idx" ON "time_credit_packages" USING btree ("org_id");
CREATE INDEX "facilities_org_id_idx" ON "facilities" USING btree ("org_id");
CREATE INDEX "facilities_org_id_type_idx" ON "facilities" USING btree ("org_id","type");
CREATE INDEX "bookings_org_id_idx" ON "bookings" USING btree ("org_id");
CREATE INDEX "bookings_org_id_status_idx" ON "bookings" USING btree ("org_id","status");
CREATE INDEX "bookings_org_id_user_id_idx" ON "bookings" USING btree ("org_id","user_id");
CREATE INDEX "bookings_org_id_created_at_idx" ON "bookings" USING btree ("org_id","created_at");
CREATE INDEX "print_jobs_org_id_idx" ON "print_jobs" USING btree ("org_id");
CREATE INDEX "print_jobs_org_id_status_idx" ON "print_jobs" USING btree ("org_id","status");
CREATE INDEX "print_jobs_org_id_user_id_idx" ON "print_jobs" USING btree ("org_id","user_id");
CREATE INDEX "transactions_org_id_idx" ON "transactions" USING btree ("org_id");
CREATE INDEX "transactions_org_id_created_at_idx" ON "transactions" USING btree ("org_id","created_at");
CREATE INDEX "transactions_org_id_user_id_idx" ON "transactions" USING btree ("org_id","user_id");
CREATE INDEX "transactions_org_id_status_idx" ON "transactions" USING btree ("org_id","status");

-- RLS backstop (ADR-0015 §3) — org isolation; the server (privileged connection)
-- stays the authoritative gate. Same pattern as 0002/0004/0005.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['time_credit_packages','facilities','bookings','print_jobs','transactions'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO authenticated', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org())', t || '_org_isolation', t);
  END LOOP;
END $$;

-- Realtime: publish bookings so admin/pending + the member keycard react live.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
  END IF;
END $$;
