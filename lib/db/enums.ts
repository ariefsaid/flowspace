/** Single source of truth for app enums (replaces @prisma/client enums, ADR-0015 §1). */
export const ROLES = ["MEMBER", "ADMIN", "BARISTA"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBERSHIP_TIERS = ["REGULAR", "PREMIUM", "GOLD"] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];
