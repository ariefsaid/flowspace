-- Reverse of 0000_init.sql (ADR-0015 §2 reversibility requirement)
DROP TABLE IF EXISTS "app_users";
DROP TABLE IF EXISTS "organizations";
DROP TYPE IF EXISTS "public"."MembershipTier";
DROP TYPE IF EXISTS "public"."Role";
