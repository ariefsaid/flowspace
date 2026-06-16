import { describe, it, expect } from "vitest";
import { nextStatus, generateOrderCode } from "@/lib/cafe/status";

describe("nextStatus", () => {
  it("AC-120: advances NEW→PREPARING→READY→COMPLETED then stops", () => {
    expect(nextStatus("NEW")).toBe("PREPARING");
    expect(nextStatus("PREPARING")).toBe("READY");
    expect(nextStatus("READY")).toBe("COMPLETED");
    expect(nextStatus("COMPLETED")).toBeNull();
    expect(nextStatus("CANCELLED")).toBeNull();
  });
});

describe("generateOrderCode", () => {
  it("generateOrderCode returns 6 lowercase base36 chars", () => {
    const code = generateOrderCode(() => 0.5);
    expect(code).toMatch(/^[0-9a-z]{6}$/);
  });

  it("generateOrderCode varies with the RNG", () => {
    expect(generateOrderCode(() => 0)).not.toBe(generateOrderCode(() => 0.999999));
  });
});
