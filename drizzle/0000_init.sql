CREATE TYPE "public"."MembershipTier" AS ENUM('REGULAR', 'PREMIUM', 'GOLD');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('MEMBER', 'ADMIN', 'BARISTA');--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_auth_user_id_key" ON "app_users" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "app_users_org_id_idx" ON "app_users" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");