-- 0000_app_schema.sql
-- Application schema: the single ordered source of truth for the app tables,
-- owned by the Supabase migration stream (ADR-0015 §2, revised: app DDL
-- consolidated into supabase/migrations; drizzle-orm remains the query layer
-- and drizzle-kit is NO LONGER the DDL authority).
--
-- This is the exact DDL that drizzle/0000_init.sql generated from
-- lib/db/schema.ts — same enums, tables, columns, constraints, and indexes.
-- Kept in lockstep with lib/db/schema.ts (the TS query model). It MUST sort
-- before 0001_auth_link (the app_users↔auth.users FK) / 0002_rls_app_users /
-- 0003_storage_bucket / 0004_rls_organizations, all of which reference these
-- tables, so a fresh `supabase start` applies cleanly in one ordered pass.

-- Enums (lib/db/enums.ts is the TS source of truth).
CREATE TYPE "public"."MembershipTier" AS ENUM ('REGULAR', 'PREMIUM', 'GOLD');
CREATE TYPE "public"."Role" AS ENUM ('MEMBER', 'ADMIN', 'BARISTA');

-- Application tables.
CREATE TABLE "app_users" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "auth_user_id" uuid,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "role" "Role" DEFAULT 'MEMBER' NOT NULL,
  "membership_tier" "MembershipTier" DEFAULT 'REGULAR' NOT NULL,
  "time_credits" integer DEFAULT 0 NOT NULL,
  "print_balance" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL,
  "archived_at" timestamp (3)
);

CREATE TABLE "organizations" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3) DEFAULT now() NOT NULL
);

-- app_users.org_id → organizations.id (ON DELETE CASCADE). The app_users↔
-- auth.users link FK lives in 0001_auth_link (platform wiring).
ALTER TABLE "app_users"
  ADD CONSTRAINT "app_users_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id")
  ON DELETE cascade ON UPDATE no action;

-- Indexes (unique email, unique auth link, org_id lookup, unique org slug).
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users" USING btree ("email");
CREATE UNIQUE INDEX "app_users_auth_user_id_key" ON "app_users" USING btree ("auth_user_id");
CREATE INDEX "app_users_org_id_idx" ON "app_users" USING btree ("org_id");
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");
