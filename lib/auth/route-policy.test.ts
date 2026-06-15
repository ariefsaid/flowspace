import { describe, expect, it } from "vitest";
import { requiredRolesFor, roleHome } from "@/lib/auth/route-policy";

describe("route policy", () => {
  it("public paths need no auth", () => {
    for (const p of ["/", "/login", "/signup", "/cafe/guest"])
      expect(requiredRolesFor(p)).toBe("public");
  });

  it("admin paths require ADMIN", () => {
    expect(requiredRolesFor("/admin")).toEqual(["ADMIN"]);
    expect(requiredRolesFor("/admin/users")).toEqual(["ADMIN"]);
  });

  it("barista requires BARISTA or ADMIN", () => {
    expect(requiredRolesFor("/barista")).toEqual(["BARISTA", "ADMIN"]);
  });

  it("M1: barista sub-paths require BARISTA or ADMIN (no fail-open)", () => {
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

  it("roleHome maps each role", () => {
    expect(roleHome("ADMIN")).toBe("/admin");
    expect(roleHome("BARISTA")).toBe("/barista");
    expect(roleHome("MEMBER")).toBe("/dashboard");
  });
});
