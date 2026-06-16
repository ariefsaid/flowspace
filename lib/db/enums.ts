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
