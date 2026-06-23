-- DB-level CHECK constraints on money/qty columns (Part A security hardening).
-- App-layer validation already rejects bad values before any write; these add a
-- last-line DB guard so a future direct writer or a missed code path cannot
-- persist a negative charge or a non-positive count. Applied on a fresh
-- `supabase db reset` while the tables are empty (CI path) — no backfill risk.
-- DDL authority per ADR-0015. Sorts after 0000–0008.
-- NB: transactions.amount_rupiah is intentionally NOT constrained (it may carry
-- credit/refund semantics later); only its discount stays non-negative-implied
-- via the domain rows that feed it.

-- Cafe
ALTER TABLE "cafe_orders"
  ADD CONSTRAINT "cafe_orders_money_nonneg"
  CHECK ("subtotal_rupiah" >= 0 AND "discount_rupiah" >= 0 AND "total_rupiah" >= 0);
ALTER TABLE "cafe_order_items"
  ADD CONSTRAINT "cafe_order_items_qty_price"
  CHECK ("qty" > 0 AND "unit_price_rupiah" >= 0);

-- Time-credit packages
ALTER TABLE "time_credit_packages"
  ADD CONSTRAINT "time_credit_packages_money_qty"
  CHECK ("hours" > 0 AND "price_rupiah" >= 0 AND "price_per_hour_rupiah" >= 0);

-- Facilities
ALTER TABLE "facilities"
  ADD CONSTRAINT "facilities_rate_nonneg"
  CHECK ("rate_per_hour_rupiah" >= 0);

-- Bookings (duration_hours is nullable for an open walk-in)
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_money_duration"
  CHECK (
    "rate_per_hour_rupiah" >= 0
    AND "amount_rupiah" >= 0
    AND ("duration_hours" IS NULL OR "duration_hours" >= 0)
  );

-- Print jobs
ALTER TABLE "print_jobs"
  ADD CONSTRAINT "print_jobs_money_qty"
  CHECK (
    "pages" > 0 AND "copies" > 0
    AND "price_per_page_rupiah" >= 0
    AND "discount_rupiah" >= 0 AND "total_rupiah" >= 0
  );
