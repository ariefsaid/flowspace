import { describe, expect, it } from "vitest";
import { requiredRolesFor, roleHome } from "@/lib/auth/route-policy";

describe("route policy", () => {
  // ---------------------------------------------------------------------------
  // AC-015 — Public paths require no auth
  // ---------------------------------------------------------------------------
  it("AC-015: public paths need no auth", () => {
    for (const p of ["/", "/login", "/signup", "/cafe/guest"])
      expect(requiredRolesFor(p)).toBe("public");
  });

  // ---------------------------------------------------------------------------
  // AC-012 — Admin paths require ADMIN
  // ---------------------------------------------------------------------------
  it("AC-012: admin paths require ADMIN", () => {
    expect(requiredRolesFor("/admin")).toEqual(["ADMIN"]);
    expect(requiredRolesFor("/admin/users")).toEqual(["ADMIN"]);
  });

  // AC-012 inverse: authorized() with ADMIN on /admin → allowed (via requiredRolesFor)
  it("AC-012: authorized — ADMIN role satisfies /admin requirements", () => {
    const required = requiredRolesFor("/admin");
    expect(required).not.toBe("public");
    expect(Array.isArray(required) && required.includes("ADMIN")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // AC-013 — /barista requires BARISTA or ADMIN
  // ---------------------------------------------------------------------------
  it("AC-013: barista requires BARISTA or ADMIN", () => {
    expect(requiredRolesFor("/barista")).toEqual(["BARISTA", "ADMIN"]);
  });

  it("AC-013: M1 — barista sub-paths require BARISTA or ADMIN (no fail-open)", () => {
    expect(requiredRolesFor("/barista/queue")).toEqual(["BARISTA", "ADMIN"]);
  });

  it("member paths require any authed user", () => {
    for (const p of [
      "/dashboard",
      "/booking",
      "/cafe",
      "/print",
      "/keycard",
      "/topup",
      "/history",
    ])
      expect(requiredRolesFor(p)).toEqual([]);
  });

  it("member sub-paths require any authed user", () => {
    expect(requiredRolesFor("/booking/new")).toEqual([]);
    expect(requiredRolesFor("/cafe/order")).toEqual([]);
  });

  it("M2: /cafe/guest stays public (checked before /cafe member prefix)", () => {
    expect(requiredRolesFor("/cafe/guest")).toBe("public");
    expect(requiredRolesFor("/cafe/guest/menu")).toBe("public");
  });

  it("M2: unknown routes fail closed — deny a plain member", () => {
    const required = requiredRolesFor("/totally-unknown");
    // Must NOT be [] (which would admit any authenticated user) or "public".
    expect(required).not.toEqual([]);
    expect(required).not.toBe("public");
    expect(required).toEqual(["ADMIN"]);
  });

  // ---------------------------------------------------------------------------
  // AC-001 — roleHome maps each role to their home path
  // ---------------------------------------------------------------------------
  it("AC-001: roleHome('MEMBER') === '/dashboard'", () => {
    expect(roleHome("MEMBER")).toBe("/dashboard");
  });

  it("AC-001: roleHome maps ADMIN → /admin, BARISTA → /barista", () => {
    expect(roleHome("ADMIN")).toBe("/admin");
    expect(roleHome("BARISTA")).toBe("/barista");
  });
});
