-- I-044 cafe nuances parity: priced variants, order notes, generic option snapshots.
-- Follows 0009_money_qty_checks.sql; 0010–0018 already claimed by I-041/I-040/I-043/
-- I-046 on current main. This migration claims 0019 (plan draft claimed 0015 before
-- those merges landed — 0019 is the corrected/actual number per the release order).
-- No new table: cafe_menu_items / cafe_orders / cafe_order_items are already
-- SELECT-only to `authenticated` (I-046 lockdown); a column ALTER does not touch
-- grants, so no grant/RLS change is needed here. DDL authority per ADR-0015.

ALTER TABLE "cafe_menu_items"
  ADD COLUMN "variant_config" jsonb;

ALTER TABLE "cafe_orders"
  ADD COLUMN "notes" text;
ALTER TABLE "cafe_orders"
  ADD CONSTRAINT "cafe_orders_notes_length"
  CHECK ("notes" IS NULL OR char_length("notes") <= 500);

ALTER TABLE "cafe_order_items"
  ADD COLUMN "variant_options" jsonb NOT NULL DEFAULT '[]'::jsonb;
