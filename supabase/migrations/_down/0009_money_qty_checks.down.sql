-- Down for 0009_money_qty_checks.sql (repo convention; CI is a fresh reset).
ALTER TABLE "cafe_orders" DROP CONSTRAINT IF EXISTS "cafe_orders_money_nonneg";
ALTER TABLE "cafe_order_items" DROP CONSTRAINT IF EXISTS "cafe_order_items_qty_price";
ALTER TABLE "time_credit_packages" DROP CONSTRAINT IF EXISTS "time_credit_packages_money_qty";
ALTER TABLE "facilities" DROP CONSTRAINT IF EXISTS "facilities_rate_nonneg";
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_money_duration";
ALTER TABLE "print_jobs" DROP CONSTRAINT IF EXISTS "print_jobs_money_qty";
