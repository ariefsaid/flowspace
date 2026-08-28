import { describe, expect, it } from "vitest";
import { canTransition, transitionPrintJob } from "./lifecycle";

describe("print lifecycle", () => {
  it("AC-615: allows only the forward queue transitions", () => {
    expect(canTransition("PENDING", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "READY")).toBe(true);
    expect(canTransition("PROCESSING", "FAILED")).toBe(true);
    expect(canTransition("READY", "COMPLETED")).toBe(true);
    expect(canTransition("FAILED", "PROCESSING", { processedBy: "agent", resolution: "retry" })).toBe(true);
    expect(canTransition("FAILED", "COMPLETED", { processedBy: "admin", resolution: "manual" })).toBe(true);
  });

  it(": rejects regressions and unresolved failed-job transitions", () => {
    expect(canTransition("PENDING", "READY")).toBe(false);
    expect(canTransition("COMPLETED", "PROCESSING")).toBe(false);
    expect(canTransition("FAILED", "PROCESSING")).toBe(false);
    expect(() => transitionPrintJob("FAILED", "PROCESSING")).toThrow(/FAILED_RESOLUTION_REQUIRED/);
    expect(() => transitionPrintJob("READY", "PENDING")).toThrow(/INVALID_PRINT_TRANSITION/);
  });

  it(": returns the next status with explicit processing metadata", () => {
    expect(transitionPrintJob("PROCESSING", "FAILED", { errorMessage: "paper jam" })).toEqual({
      status: "FAILED", errorMessage: "paper jam",
    });
  });
});
