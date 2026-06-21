/**
 * Keycard rotating-token helper (I-024 — SIMULATED door access).
 *
 * No external door system, no table: the QR value is a deterministic, server-
 * signed token derived from the booking id + a 30s time window. The HMAC secret
 * stays server-side so a member cannot forge a valid token for another booking
 * or a future window. [SEC] ponytail: a plain HMAC over `${bookingId}|${window}`.
 *
 * Node runtime only (node:crypto) — never import from the Edge middleware.
 */
// Server-only: imports node:crypto. Client components import the rotation window
// from @/lib/keycard/window instead (no crypto), so this never enters the browser bundle.
import { createHmac } from "node:crypto";
import { TOKEN_WINDOW_MS } from "@/lib/keycard/window";

// Re-export so existing server callers keep importing it from here.
export { TOKEN_WINDOW_MS };

/**
 * Secret used to sign the token. ponytail: a stable dev default keeps local
 * runs working without env; production must set KEYCARD_TOKEN_SECRET. The secret
 * existing only server-side is what makes the token unforgeable by the client.
 */
function secret(): string {
  return (
    process.env.KEYCARD_TOKEN_SECRET ?? "flowspace-keycard-dev-secret"
  );
}

/** The 30s time-window index for a given instant. */
export function getTokenWindow(date: Date = new Date()): number {
  return Math.floor(date.getTime() / TOKEN_WINDOW_MS);
}

/** Deterministic token for a booking + window. */
export function keycardTokenForWindow(
  bookingId: string,
  window: number,
): string {
  return createHmac("sha256", secret())
    .update(`${bookingId}|${window}`)
    .digest("hex");
}

/** Token for the booking's current window (the value rendered in the QR). */
export function generateKeycardToken(
  bookingId: string,
  date: Date = new Date(),
): string {
  return keycardTokenForWindow(bookingId, getTokenWindow(date));
}
