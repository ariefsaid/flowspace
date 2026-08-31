/**
 * Simulated payment-gateway decision seam for the purchase money paths
 * (ORIG `api/mock/payment`: 95% approve / 5% random decline).
 *
 * The original's bare `Math.random() > 0.05` is deliberately NOT reproduced
 * here: a random decline in an injectable-free helper is untestable and
 * would make demos flaky. `simulatePaymentOutcome` always APPROVES by
 * default; a caller (a test) can force a decline by injecting a
 * `PaymentDecision`. [SEC/MONEY] — the purchase repositories must not write
 * any credit/ledger row when this returns false.
 */
export type PaymentDecision = () => boolean; // true = approved

/** Demo-safe default: always approves. */
export const approvePayment: PaymentDecision = () => true;

/** Test seam: always declines. */
export const declinePayment: PaymentDecision = () => false;

export function simulatePaymentOutcome(
  decide: PaymentDecision = approvePayment,
): boolean {
  return decide();
}
