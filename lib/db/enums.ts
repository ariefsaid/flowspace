/** Single source of truth for app enums (replaces @prisma/client enums, ADR-0015 §1). */
export const ROLES = ["MEMBER", "ADMIN", "BARISTA"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBERSHIP_TIERS = ["REGULAR", "PREMIUM", "GOLD"] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

// -- Cafe domain (I-022) ----------------------------------------------------
export const CAFE_CATEGORIES = ["COFFEE", "NON_COFFEE", "FOOD", "SNACK"] as const;
export type CafeCategory = (typeof CAFE_CATEGORIES)[number];

export const CAFE_ORDER_STATUSES = ["NEW", "PREPARING", "READY", "COMPLETED", "CANCELLED"] as const;
export type CafeOrderStatus = (typeof CAFE_ORDER_STATUSES)[number];

export const DRINK_TEMPERATURES = ["HOT", "COLD", "ICE_BLENDED"] as const;
export type DrinkTemperature = (typeof DRINK_TEMPERATURES)[number];

export const SUGAR_LEVELS = ["NORMAL", "LESS", "NONE"] as const;
export type SugarLevel = (typeof SUGAR_LEVELS)[number];

// -- Booking domain (I-021) -------------------------------------------------
export const BOOKING_FACILITY_TYPES = [
  "WALKIN_COWORKING",
  "WALKIN_MEETING",
  "COWORKING_SEAT",
  "MEETING_ROOM",
  "FULL_ROOM",
] as const;
export type BookingFacilityType = (typeof BOOKING_FACILITY_TYPES)[number];

export const BOOKING_STATUSES = ["ACTIVE", "COMPLETED", "CANCELLED"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_PAYMENT_STATUSES = [
  "WAITING_CASHIER",
  "PAID_CASHIER",
  "PAID_ONLINE",
  "PENDING",
] as const;
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];

export const FACILITY_TYPES = ["COWORKING_SEAT", "MEETING_ROOM"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

// -- Print domain (I-023) ---------------------------------------------------
export const PRINT_COLOR_MODES = ["BW", "COLOR"] as const;
export type PrintColorMode = (typeof PRINT_COLOR_MODES)[number];

export const PRINT_JOB_STATUSES = ["PENDING", "READY", "COMPLETED"] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

// -- Transactions ledger (I-020/021/022/023 — unified reporting) ------------
export const TRANSACTION_TYPES = [
  "PACKAGE_PURCHASE",
  "CAFE_ORDER",
  "PRINT_JOB",
  "BOOKING",
  "PRINT_TOPUP",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["COMPLETED", "PENDING"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
