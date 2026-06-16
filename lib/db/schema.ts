// DDL authority = supabase/migrations/0000_app_schema.sql; this file is the Drizzle TS query mirror (drizzle-kit is not run in CI).
import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import type { InferSelectModel } from "drizzle-orm";

export const roleEnum = pgEnum("Role", ["MEMBER", "ADMIN", "BARISTA"]);
export const membershipTierEnum = pgEnum("MembershipTier", [
  "REGULAR",
  "PREMIUM",
  "GOLD",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("organizations_slug_key").on(t.slug)],
);

export const appUsers = pgTable(
  "app_users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Links 1:1 to Supabase auth.users (ADR-0014 §1). FK added in a supabase/ migration (Task 4.2).
    authUserId: uuid("auth_user_id"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull().default("MEMBER"),
    membershipTier: membershipTierEnum("membership_tier")
      .notNull()
      .default("REGULAR"),
    timeCredits: integer("time_credits").notNull().default(0),
    printBalance: integer("print_balance").notNull().default(0),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { precision: 3, mode: "date" }),
  },
  (t) => [
    uniqueIndex("app_users_email_key").on(t.email),
    uniqueIndex("app_users_auth_user_id_key").on(t.authUserId),
    index("app_users_org_id_idx").on(t.orgId),
  ],
);

export type AppUser = InferSelectModel<typeof appUsers>;
export type Organization = InferSelectModel<typeof organizations>;
