import { describe, expect, it } from "vitest";
import { authConfig } from "@/lib/auth.config";

describe("auth.config callbacks", () => {
  it("AC-020: jwt copies role+orgId from user on sign-in", async () => {
    const token = await authConfig.callbacks!.jwt!({
      token: { sub: "u1" } as never,
      user: {
        id: "u1",
        role: "ADMIN",
        orgId: "org1",
        email: "a@b.c",
      } as never,
    } as never);
    expect(token!.role).toBe("ADMIN");
    expect(token!.orgId).toBe("org1");
    expect(token!.sub).toBe("u1");
  });

  it("AC-020: jwt leaves the token unchanged when there is no user (subsequent requests)", async () => {
    const token = await authConfig.callbacks!.jwt!({
      token: { sub: "u1", role: "MEMBER", orgId: "org1" } as never,
    } as never);
    expect(token!.role).toBe("MEMBER");
    expect(token!.orgId).toBe("org1");
    expect(token!.sub).toBe("u1");
  });

  it("AC-020: session exposes id/role/orgId from token", async () => {
    const session = await authConfig.callbacks!.session!({
      session: { user: {} } as never,
      token: { sub: "u1", role: "MEMBER", orgId: "org1" } as never,
    } as never);
    expect(session.user!.id).toBe("u1");
    expect(session.user!.role).toBe("MEMBER");
    expect(session.user!.orgId).toBe("org1");
  });
});
