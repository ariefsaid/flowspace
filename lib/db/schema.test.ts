import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { appUsers, organizations, roleEnum, membershipTierEnum } from "@/lib/db/schema";

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
});
