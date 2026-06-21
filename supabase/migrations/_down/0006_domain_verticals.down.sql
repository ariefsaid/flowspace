-- Down for 0006_domain_verticals.sql (repo convention; CI is a fresh reset).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE bookings;
  END IF;
END $$;

DROP TABLE IF EXISTS "transactions" CASCADE;
DROP TABLE IF EXISTS "print_jobs" CASCADE;
DROP TABLE IF EXISTS "bookings" CASCADE;
DROP TABLE IF EXISTS "facilities" CASCADE;
DROP TABLE IF EXISTS "time_credit_packages" CASCADE;
DROP TYPE IF EXISTS "public"."TransactionStatus";
DROP TYPE IF EXISTS "public"."TransactionType";
DROP TYPE IF EXISTS "public"."PrintJobStatus";
DROP TYPE IF EXISTS "public"."PrintColorMode";
DROP TYPE IF EXISTS "public"."FacilityType";
DROP TYPE IF EXISTS "public"."BookingPaymentStatus";
DROP TYPE IF EXISTS "public"."BookingStatus";
DROP TYPE IF EXISTS "public"."BookingFacilityType";
