import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  appUsers,
  organizations,
  roleEnum,
  membershipTierEnum,
  printJobStatusEnum,
  printJobs,
  orgPrintPricing,
  printers,
  printAgentConfigs,
  printTopupPackages,
  bookings,
  bookingStatusEnum,
  bookingModeEnum,
  bookingPaymentMethodEnum,
  facilities,
  facilityTypeEnum,
  transactions,
  timeCreditLots,
} from "@/lib/db/schema";

describe("schema", () => {
  it("app_users has the FR-021 columns and an auth_user_id link, no password column", () => {
    const cols = Object.keys(getTableColumns(appUsers));
    for (const c of [
      "id",
      "orgId",
      "authUserId",
      "email",
      "name",
      "role",
      "membershipTier",
      "timeCredits",
      "printBalance",
      "createdAt",
      "updatedAt",
      "archivedAt",
    ])
      expect(cols).toContain(c);
    expect(cols).not.toContain("passwordHash"); // AC-023: no app-side password column (ADR-0014 §1)
    expect(cols).not.toContain("password");
  });
  it("organizations has id/name/slug/createdAt/updatedAt", () => {
    const cols = Object.keys(getTableColumns(organizations));
    for (const c of ["id", "name", "slug", "createdAt", "updatedAt"])
      expect(cols).toContain(c);
  });
  it("enums carry the ADR values", () => {
    expect(roleEnum.enumValues).toEqual(["MEMBER", "ADMIN", "BARISTA"]);
    expect(membershipTierEnum.enumValues).toEqual(["REGULAR", "PREMIUM", "GOLD"]);
  });

  it(": print_jobs carries the I-043 lifecycle/range/printer columns", () => {
    const cols = Object.keys(getTableColumns(printJobs));
    for (const c of [
      "pageRange",
      "totalPages",
      "printerId",
      "errorMessage",
      "processedBy",
      "processedAt",
      "completedAt",
    ])
      expect(cols).toContain(c);
    expect(printJobStatusEnum.enumValues).toEqual([
      "PENDING",
      "PROCESSING",
      "READY",
      "COMPLETED",
      "FAILED",
    ]);
  });

  it(": org_print_pricing mirrors the matrix shape (per org + color + paper)", () => {
    const cols = Object.keys(getTableColumns(orgPrintPricing));
    for (const c of ["orgId", "colorMode", "paperSize", "pricePerPageRupiah", "isActive"])
      expect(cols).toContain(c);
    // The flat legacy single-rate shape no longer exists in the mirror.
    expect(cols).not.toContain("bwRatePerPageRupiah");
    expect(cols).not.toContain("colorRatePerPageRupiah");
  });

  it(": printers / print_agent_configs / print_topup_packages tables mirror the DDL", () => {
    const printerCols = Object.keys(getTableColumns(printers));
    for (const c of [
      "orgId",
      "name",
      "displayName",
      "location",
      "printerType",
      "colorSupport",
      "paperSizes",
      "isActive",
      "isDefault",
      "sortOrder",
      "archivedAt",
    ])
      expect(printerCols).toContain(c);

    const cfgCols = Object.keys(getTableColumns(printAgentConfigs));
    for (const c of ["orgId", "keySelector", "keyHash", "isActive"])
      expect(cfgCols).toContain(c);

    const pkgCols = Object.keys(getTableColumns(printTopupPackages));
    for (const c of ["orgId", "pages", "priceRupiah", "sortOrder"])
      expect(pkgCols).toContain(c);
  });

  // -- I-040 booking parity (spec 0007) --------------------------------------
  it(": bookings carries the I-040 mode/payment/discount columns; BookingStatus gains PENDING/CONFIRMED", () => {
    const cols = Object.keys(getTableColumns(bookings));
    for (const c of ["bookingMode", "baseAmountRupiah", "discountRupiah", "paymentMethod"])
      expect(cols).toContain(c);
    expect(bookingStatusEnum.enumValues).toEqual([
      "ACTIVE",
      "COMPLETED",
      "CANCELLED",
      "PENDING",
      "CONFIRMED",
    ]);
    expect(bookingModeEnum.enumValues).toEqual(["SCHEDULED", "WALKIN"]);
    expect(bookingPaymentMethodEnum.enumValues).toEqual([
      "time_credits",
      "online",
      "cashier",
    ]);
  });

  it(": facilities carries capacity/seatLabel/zone/maxHoursCap; FacilityType gains FULL_ROOM", () => {
    const cols = Object.keys(getTableColumns(facilities));
    for (const c of ["capacity", "seatLabel", "zone", "maxHoursCap"]) expect(cols).toContain(c);
    expect(facilityTypeEnum.enumValues).toEqual(["COWORKING_SEAT", "MEETING_ROOM", "FULL_ROOM"]);
  });

  it(": transactions carries paymentMethod", () => {
    const cols = Object.keys(getTableColumns(transactions));
    expect(cols).toContain("paymentMethod");
  });

  it(": time_credit_lots mirrors the DDL shape", () => {
    const cols = Object.keys(getTableColumns(timeCreditLots));
    for (const c of [
      "id",
      "orgId",
      "userId",
      "packageId",
      "purchaseTransactionId",
      "totalHours",
      "remainingHours",
      "purchasedAt",
      "expiresAt",
      "createdAt",
      "updatedAt",
    ])
      expect(cols).toContain(c);
  });
});