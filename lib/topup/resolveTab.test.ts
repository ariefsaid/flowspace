/**
 * AC-i049-8: ?tab= deep-link resolution for the topup page — supports
 * "print" and the original's "papercut" alias, defaulting to "time".
 */
import { describe, it, expect } from "vitest";
import { resolveInitialTab } from "./resolveTab";

describe("resolveInitialTab", () => {
  it("resolves ?tab=print to the print tab", () => {
    expect(resolveInitialTab("print")).toBe("print");
  });

  it("resolves the original's ?tab=papercut alias to the print tab", () => {
    expect(resolveInitialTab("papercut")).toBe("print");
  });

  it("defaults to the time tab when the param is missing", () => {
    expect(resolveInitialTab(undefined)).toBe("time");
  });

  it("defaults to the time tab for an unrecognized value", () => {
    expect(resolveInitialTab("bogus")).toBe("time");
  });

  it("takes the first value when Next.js hands back an array", () => {
    expect(resolveInitialTab(["print", "time"])).toBe("print");
  });
});
