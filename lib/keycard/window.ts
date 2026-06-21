/**
 * Keycard QR rotation window (client-safe — no crypto). Split from token.ts so
 * client components can import the timing constant without pulling node:crypto
 * into the browser bundle. The signing lives server-only in token.ts.
 */
/** 30s rotation window (recon: "rotating QR ~30s window"). */
export const TOKEN_WINDOW_MS = 30_000;
