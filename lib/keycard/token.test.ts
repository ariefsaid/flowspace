/**
 * Unit tests for the keycard rotating-token helper (I-024, [SEC]).
 *
 * AC-140: token is deterministic for (bookingId, window)
 * AC-141: token rotates across 30s windows and differs per booking (unforgeable
 *         cross-booking), while staying server-signed (the client never sees the
 *         secret — verified here only by the deterministic + distinctness props).
 */
import { describe, expect, it } from "vitest";
import {
  generateKeycardToken,
  getTokenWindow,
  keycardTokenForWindow,
  TOKEN_WINDOW_MS,
} from "@/lib/keycard/token";

const HEX64 = /^[0-9a-f]{64}$/;

describe("lib/keycard/token", () => {
  it("AC-140: keycardTokenForWindow is deterministic for (bookingId, window)", () => {
    const a = keycardTokenForWindow("bk_1", 1000);
    const b = keycardTokenForWindow("bk_1", 1000);
    expect(a).toBe(b);
    expect(a).toMatch(HEX64); // sha256 hex
  });

  it("AC-141: token differs across adjacent windows (rotates every 30s)", () => {
    const w0 = keycardTokenForWindow("bk_1", 1000);
    const w1 = keycardTokenForWindow("bk_1", 1001);
    expect(w0).not.toBe(w1);
  });

  it("AC-141: token differs across bookings for the same window (booking-bound)", () => {
    const t1 = keycardTokenForWindow("bk_1", 1000);
    const t2 = keycardTokenForWindow("bk_2", 1000);
    expect(t1).not.toBe(t2);
  });

  it("getTokenWindow buckets by the 30s window size", () => {
    expect(TOKEN_WINDOW_MS).toBe(30_000);
    const base = new Date("2026-06-21T00:00:00Z").getTime();
    expect(getTokenWindow(new Date(base))).toBe(getTokenWindow(new Date(base + 29_999)));
    expect(getTokenWindow(new Date(base + 30_000))).toBe(
      getTokenWindow(new Date(base)) + 1,
    );
  });

  it("generateKeycardToken = keycardTokenForWindow(bookingId, getTokenWindow())", () => {
    const now = new Date("2026-06-21T12:00:05Z");
    expect(generateKeycardToken("bk_1", now)).toBe(
      keycardTokenForWindow("bk_1", getTokenWindow(now)),
    );
  });
});
