import { describe, expect, it } from "vitest";
import { can } from "@/lib/auth/policy";

describe("can() UX policy", () => {
  it("AC-022: only ADMIN can access admin", () => {
    expect(can("access", "admin", { role: "ADMIN" })).toBe(true);
    expect(can("access", "admin", { role: "MEMBER" })).toBe(false);
    expect(can("access", "admin", { role: "BARISTA" })).toBe(false);
  });

  it("AC-022: ADMIN and BARISTA can access barista", () => {
    expect(can("access", "barista", { role: "BARISTA" })).toBe(true);
    expect(can("access", "barista", { role: "ADMIN" })).toBe(true);
    expect(can("access", "barista", { role: "MEMBER" })).toBe(false);
  });
});
