-- Tier model correction (I-041, spec 0008, DIV-1/ADR-0016). After 0009_money_qty_checks.sql.
-- Widens membership_tier_config from the 2-dim (cafe/print) spec-0006 shape to all four
-- dimensions (coworking/meeting/cafe/print), widens the CHECK to cover all four, and
-- rewrites every existing org's rows to the locked values. Enum, (org_id,tier) unique
-- index, org_id index, and the _org_isolation RLS policy are left unchanged.

ALTER TABLE "public"."membership_tier_config"
  ADD COLUMN "coworking_discount_pct" integer NOT NULL DEFAULT 0,
  ADD COLUMN "meeting_discount_pct" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."membership_tier_config"
  DROP CONSTRAINT "membership_tier_config_pct_range";

ALTER TABLE "public"."membership_tier_config"
  ADD CONSTRAINT "membership_tier_config_pct_range" CHECK (
    "coworking_discount_pct" BETWEEN 0 AND 100 AND
    "meeting_discount_pct" BETWEEN 0 AND 100 AND
    "cafe_discount_pct" BETWEEN 0 AND 100 AND
    "print_discount_pct" BETWEEN 0 AND 100
  );

-- Rewrite every org's rows to the locked values (FR-521). ORIG base/mid/top →
-- REGULAR/PREMIUM/GOLD.
UPDATE "public"."membership_tier_config" SET
  "coworking_discount_pct" = 0, "meeting_discount_pct" = 0,
  "cafe_discount_pct" = 0, "print_discount_pct" = 0
  WHERE "tier" = 'REGULAR';
UPDATE "public"."membership_tier_config" SET
  "coworking_discount_pct" = 10, "meeting_discount_pct" = 10,
  "cafe_discount_pct" = 5, "print_discount_pct" = 5
  WHERE "tier" = 'PREMIUM';
UPDATE "public"."membership_tier_config" SET
  "coworking_discount_pct" = 15, "meeting_discount_pct" = 15,
  "cafe_discount_pct" = 10, "print_discount_pct" = 10
  WHERE "tier" = 'GOLD';
