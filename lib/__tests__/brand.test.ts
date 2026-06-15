import { describe, expect, it } from "vitest";
import { brand } from "@/brand.config";

describe("brand config", () => {
  it("defaults the brand name to FlowSpace", () => {
    expect(brand.name).toBe("FlowSpace");
  });

  it("uses the id-ID locale", () => {
    expect(brand.locale).toBe("id-ID");
  });
});
