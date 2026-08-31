import { describe, expect, it } from "vitest";
import {
  simulatePaymentOutcome,
  approvePayment,
  declinePayment,
} from "./mockPaymentGateway";

/**
 * ORIG api/mock/payment simulates a payment gateway with a 5% random decline.
 * Here the seam is injectable/deterministic (never bare Math.random) and
 * defaults to always-approve so demos never randomly fail; a test can force
 * a decline via `declinePayment`.
 */
describe("simulatePaymentOutcome", () => {
  it("approves by default with no decision function supplied", () => {
    expect(simulatePaymentOutcome()).toBe(true);
  });

  it("approves when given the approvePayment decision", () => {
    expect(simulatePaymentOutcome(approvePayment)).toBe(true);
  });

  it("declines when given the declinePayment decision (test seam)", () => {
    expect(simulatePaymentOutcome(declinePayment)).toBe(false);
  });

  it("delegates to any injected decision function", () => {
    let calls = 0;
    const decide = () => {
      calls += 1;
      return false;
    };
    expect(simulatePaymentOutcome(decide)).toBe(false);
    expect(calls).toBe(1);
  });
});
