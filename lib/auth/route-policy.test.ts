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

  it("member paths require any authed user", () => {
    expect(requiredRolesFor("/dashboard")).toEqual([]);
  });

  it("roleHome maps each role", () => {
    expect(roleHome("ADMIN")).toBe("/admin");
    expect(roleHome("BARISTA")).toBe("/barista");
    expect(roleHome("MEMBER")).toBe("/dashboard");
  });
});
