// DDL authority = supabase/migrations/0000_app_schema.sql; this file is the Drizzle TS query mirror (drizzle-kit is not run in CI).
import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
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

// ---------------------------------------------------------------------------
// Cafe domain (I-022). DDL authority = supabase/migrations/0005_cafe_domain.sql;
// these tables are the TS query mirror kept in lockstep.
// ---------------------------------------------------------------------------
export const cafeCategoryEnum = pgEnum("CafeCategory", [
  "COFFEE",
  "NON_COFFEE",
  "FOOD",
  "SNACK",
]);
export const cafeOrderStatusEnum = pgEnum("CafeOrderStatus", [
  "NEW",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
]);
export const drinkTemperatureEnum = pgEnum("DrinkTemperature", [
  "HOT",
  "COLD",
  "ICE_BLENDED",
]);
export const sugarLevelEnum = pgEnum("SugarLevel", ["NORMAL", "LESS", "NONE"]);

export const cafeMenuItems = pgTable(
  "cafe_menu_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    category: cafeCategoryEnum("category").notNull(),
    priceRupiah: integer("price_rupiah").notNull(),
    description: text("description").notNull(),
    hasVariants: boolean("has_variants").notNull().default(false),
    available: boolean("available").notNull().default(true),
    archivedAt: timestamp("archived_at", { precision: 3, mode: "date" }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("cafe_menu_items_org_id_idx").on(t.orgId),
    index("cafe_menu_items_org_id_category_idx").on(t.orgId, t.category),
  ],
);

export const cafeOrders = pgTable(
  "cafe_orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    customerUserId: text("customer_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    guestName: text("guest_name"),
    status: cafeOrderStatusEnum("status").notNull().default("NEW"),
    subtotalRupiah: integer("subtotal_rupiah").notNull(),
    discountRupiah: integer("discount_rupiah").notNull().default(0),
    totalRupiah: integer("total_rupiah").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("cafe_orders_org_id_code_key").on(t.orgId, t.code),
    index("cafe_orders_org_id_idx").on(t.orgId),
    index("cafe_orders_org_id_status_idx").on(t.orgId, t.status),
    index("cafe_orders_org_id_created_at_idx").on(t.orgId, t.createdAt),
  ],
);

export const cafeOrderItems = pgTable(
  "cafe_order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    orderId: text("order_id")
      .notNull()
      .references(() => cafeOrders.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id").references(() => cafeMenuItems.id, {
      onDelete: "set null",
    }),
    nameSnapshot: text("name_snapshot").notNull(),
    qty: integer("qty").notNull(),
    unitPriceRupiah: integer("unit_price_rupiah").notNull(),
    temperature: drinkTemperatureEnum("temperature"),
    sugar: sugarLevelEnum("sugar"),
  },
  (t) => [index("cafe_order_items_order_id_idx").on(t.orderId)],
);

export type CafeMenuItem = InferSelectModel<typeof cafeMenuItems>;
export type CafeOrder = InferSelectModel<typeof cafeOrders>;
export type CafeOrderItem = InferSelectModel<typeof cafeOrderItems>;
