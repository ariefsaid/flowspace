/**
 * Cafe order status machine + order-code generator (I-022, ADR-0012).
 */
import type { CafeOrderStatus } from "@/lib/db/enums";

const FORWARD: Partial<Record<CafeOrderStatus, CafeOrderStatus>> = {
  NEW: "PREPARING",
  PREPARING: "READY",
  READY: "COMPLETED",
};

/** Returns the next status in the forward lifecycle, or null if terminal. */
export function nextStatus(s: CafeOrderStatus): CafeOrderStatus | null {
  return FORWARD[s] ?? null;
}

/**
 * Generates a 6-character lowercase base36 order code (ADR-0012).
 * The RNG is injectable for deterministic tests.
 */
export function generateOrderCode(rng: () => number = Math.random): string {
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return out;
}
