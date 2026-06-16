/**
 * Unit tests for lib/cafe/authz.ts (I-022, Phase D)
 * AC-123: MEMBER cannot mutate order status; BARISTA/ADMIN can
 */
import { describe, it, expect } from "vitest";
import { canMutateOrderStatus } from "@/lib/cafe/authz";

describe("canMutateOrderStatus", () => {
  it("AC-123: MEMBER cannot mutate order status; BARISTA/ADMIN can", () => {
    expect(canMutateOrderStatus("MEMBER")).toBe(false);
    expect(canMutateOrderStatus("BARISTA")).toBe(true);
    expect(canMutateOrderStatus("ADMIN")).toBe(true);
  });
});
