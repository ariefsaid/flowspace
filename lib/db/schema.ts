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
import { sql } from "drizzle-orm";

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

// ---------------------------------------------------------------------------
// Domain verticals (I-020 packages, I-021 booking, I-023 print, ledger).
// DDL authority = supabase/migrations/0006_domain_verticals.sql; TS mirror.
// Balances live on app_users (timeCredits / printBalance) — no ledger table.
// ---------------------------------------------------------------------------
export const bookingFacilityTypeEnum = pgEnum("BookingFacilityType", [
  "WALKIN_COWORKING",
  "WALKIN_MEETING",
  "COWORKING_SEAT",
  "MEETING_ROOM",
  "FULL_ROOM",
]);
export const bookingStatusEnum = pgEnum("BookingStatus", ["ACTIVE", "COMPLETED", "CANCELLED"]);
export const bookingPaymentStatusEnum = pgEnum("BookingPaymentStatus", [
  "WAITING_CASHIER",
  "PAID_CASHIER",
  "PAID_ONLINE",
  "PENDING",
]);
export const facilityTypeEnum = pgEnum("FacilityType", ["COWORKING_SEAT", "MEETING_ROOM"]);
export const printColorModeEnum = pgEnum("PrintColorMode", ["BW", "COLOR"]);
export const printJobStatusEnum = pgEnum("PrintJobStatus", [
  "PENDING",
  "PROCESSING",
  "READY",
  "COMPLETED",
  "FAILED",
]);
export const printerTypeEnum = pgEnum("PrinterType", ["LASER", "INKJET"]);
export const transactionTypeEnum = pgEnum("TransactionType", [
  "PACKAGE_PURCHASE",
  "CAFE_ORDER",
  "PRINT_JOB",
  "BOOKING",
  "PRINT_TOPUP",
]);
export const transactionStatusEnum = pgEnum("TransactionStatus", ["COMPLETED", "PENDING"]);

export const timeCreditPackages = pgTable(
  "time_credit_packages",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hours: integer("hours").notNull(),
    priceRupiah: integer("price_rupiah").notNull(),
    pricePerHourRupiah: integer("price_per_hour_rupiah").notNull(),
    popular: boolean("popular").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { precision: 3, mode: "date" }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("time_credit_packages_org_id_idx").on(t.orgId)],
);

export const facilities = pgTable(
  "facilities",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: facilityTypeEnum("type").notNull(),
    ratePerHourRupiah: integer("rate_per_hour_rupiah").notNull(),
    available: boolean("available").notNull().default(true),
    archivedAt: timestamp("archived_at", { precision: 3, mode: "date" }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("facilities_org_id_idx").on(t.orgId), index("facilities_org_id_type_idx").on(t.orgId, t.type)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
    facilityType: bookingFacilityTypeEnum("facility_type").notNull(),
    facilityId: text("facility_id").references(() => facilities.id, { onDelete: "set null" }),
    facilityName: text("facility_name").notNull(),
    startAt: timestamp("start_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    endAt: timestamp("end_at", { precision: 3, mode: "date" }),
    durationHours: integer("duration_hours"),
    ratePerHourRupiah: integer("rate_per_hour_rupiah").notNull(),
    amountRupiah: integer("amount_rupiah").notNull().default(0),
    status: bookingStatusEnum("status").notNull().default("ACTIVE"),
    paymentStatus: bookingPaymentStatusEnum("payment_status").notNull().default("WAITING_CASHIER"),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_org_id_idx").on(t.orgId),
    index("bookings_org_id_status_idx").on(t.orgId, t.status),
    index("bookings_org_id_user_id_idx").on(t.orgId, t.userId),
    index("bookings_org_id_created_at_idx").on(t.orgId, t.createdAt),
  ],
);

export const printJobs = pgTable(
  "print_jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    pages: integer("pages").notNull(),
    copies: integer("copies").notNull().default(1),
    colorMode: printColorModeEnum("color_mode").notNull().default("BW"),
    paperSize: text("paper_size").notNull().default("A4"),
    duplex: boolean("duplex").notNull().default(false),
    pricePerPageRupiah: integer("price_per_page_rupiah").notNull(),
    discountRupiah: integer("discount_rupiah").notNull().default(0),
    totalRupiah: integer("total_rupiah").notNull(),
    storagePath: text("storage_path"),
    // I-043 print parity (spec 0009).
    pageRange: text("page_range").default("all"),
    totalPages: integer("total_pages"),
    printerId: text("printer_id").references(() => printers.id, { onDelete: "restrict" }),
    errorMessage: text("error_message"),
    processedBy: text("processed_by"),
    processedAt: timestamp("processed_at", { precision: 3, mode: "date" }),
    completedAt: timestamp("completed_at", { precision: 3, mode: "date" }),
    status: printJobStatusEnum("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("print_jobs_org_id_idx").on(t.orgId),
    index("print_jobs_org_id_status_idx").on(t.orgId, t.status),
    index("print_jobs_org_id_user_id_idx").on(t.orgId, t.userId),
    index("print_jobs_org_id_status_created_at_idx").on(t.orgId, t.status, t.createdAt),
    index("print_jobs_printer_id_idx").on(t.printerId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => appUsers.id, { onDelete: "set null" }),
    type: transactionTypeEnum("type").notNull(),
    description: text("description").notNull(),
    amountRupiah: integer("amount_rupiah").notNull(),
    discountRupiah: integer("discount_rupiah").notNull().default(0),
    status: transactionStatusEnum("status").notNull().default("COMPLETED"),
    cafeOrderId: text("cafe_order_id").references(() => cafeOrders.id, { onDelete: "set null" }),
    bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    printJobId: text("print_job_id").references(() => printJobs.id, { onDelete: "set null" }),
    packageId: text("package_id").references(() => timeCreditPackages.id, { onDelete: "set null" }),
    printTopupPackageId: text("print_topup_package_id").references(() => printTopupPackages.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_org_id_idx").on(t.orgId),
    index("transactions_org_id_created_at_idx").on(t.orgId, t.createdAt),
    index("transactions_org_id_user_id_idx").on(t.orgId, t.userId),
    index("transactions_org_id_status_idx").on(t.orgId, t.status),
    index("transactions_org_id_print_topup_package_idx").on(t.orgId, t.printTopupPackageId),
  ],
);

// Pricing configuration (I-027, spec 0006) — admin-editable discount + base rates.
export const membershipTierConfig = pgTable(
  "membership_tier_config",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    tier: membershipTierEnum("tier").notNull(),
    coworkingDiscountPct: integer("coworking_discount_pct").notNull().default(0),
    meetingDiscountPct: integer("meeting_discount_pct").notNull().default(0),
    cafeDiscountPct: integer("cafe_discount_pct").notNull().default(0),
    printDiscountPct: integer("print_discount_pct").notNull().default(0),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("membership_tier_config_org_id_tier_idx").on(t.orgId, t.tier),
    index("membership_tier_config_org_id_idx").on(t.orgId),
  ],
);

export const orgPrintPricing = pgTable(
  "org_print_pricing",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    // One row per (org, color_mode, paper_size) matrix cell (I-043, spec 0009).
    colorMode: printColorModeEnum("color_mode").notNull(),
    paperSize: text("paper_size").notNull(),
    pricePerPageRupiah: integer("price_per_page_rupiah").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("org_print_pricing_matrix_org_mode_paper_idx").on(
      t.orgId,
      t.colorMode,
      t.paperSize,
    ),
    index("org_print_pricing_org_lookup_idx").on(t.orgId),
  ],
);

// ---------------------------------------------------------------------------
// Print parity (I-043, spec 0009): printers + agent key config + packages.
// DDL authority = supabase/migrations/0013_print_parity_core.sql (0014 for
// print_topup_packages). TS mirror kept in lockstep.
// ---------------------------------------------------------------------------
export const printers = pgTable(
  "printers",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // CUPS name — org-scoped unique
    displayName: text("display_name").notNull(),
    location: text("location"),
    printerType: printerTypeEnum("printer_type").notNull().default("LASER"),
    colorSupport: boolean("color_support").notNull().default(false),
    paperSizes: text("paper_sizes").array().notNull().default(["A4"]),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { precision: 3, mode: "date" }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("printers_org_id_name_key").on(t.orgId, t.name),
    index("printers_org_id_idx").on(t.orgId),
    uniqueIndex("printers_org_single_default_idx")
      .on(t.orgId)
      .where(sql`${t.isDefault} AND ${t.archivedAt} IS NULL`),
  ],
);

export const printAgentConfigs = pgTable(
  "print_agent_configs",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    keySelector: text("key_selector").notNull().unique(), // public, non-secret
    keyHash: text("key_hash").notNull(), // SHA-256; raw key never persisted
    isActive: boolean("is_active").notNull().default(true),
    serverName: text("server_name"),
    lastSeenAt: timestamp("last_seen_at", { precision: 3, mode: "date" }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
);

export const printAgentRateLimitEvents = pgTable(
  "print_agent_rate_limit_events",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    configId: text("config_id")
      .notNull()
      .references(() => printAgentConfigs.id, { onDelete: "cascade" }),
    requestedAt: timestamp("requested_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("print_agent_rate_limit_events_config_time_idx").on(t.configId, t.requestedAt),
    index("print_agent_rate_limit_events_org_id_idx").on(t.orgId),
  ],
);

export const printTopupPackages = pgTable(
  "print_topup_packages",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    pages: integer("pages").notNull(),
    priceRupiah: integer("price_rupiah").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { precision: 3, mode: "date" }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("print_topup_packages_org_id_idx").on(t.orgId)],
);

export type TimeCreditPackage = InferSelectModel<typeof timeCreditPackages>;
export type Facility = InferSelectModel<typeof facilities>;
export type Booking = InferSelectModel<typeof bookings>;
export type PrintJob = InferSelectModel<typeof printJobs>;
export type Transaction = InferSelectModel<typeof transactions>;
export type MembershipTierConfig = InferSelectModel<typeof membershipTierConfig>;
export type OrgPrintPricing = InferSelectModel<typeof orgPrintPricing>;
export type Printer = InferSelectModel<typeof printers>;
export type PrintAgentConfig = InferSelectModel<typeof printAgentConfigs>;
export type PrintAgentRateLimitEvent = InferSelectModel<typeof printAgentRateLimitEvents>;
export type PrintTopupPackage = InferSelectModel<typeof printTopupPackages>;
