/**
 * saveAnalyticsSettingsAction denies non-ADMIN callers (no write), persists a
 * valid GA4 measurement ID + enable toggle for an ADMIN with the session
 * orgId, allows clearing the ID (empty string), and rejects a malformed ID
 * before any write (each `it()` title names its own owning acceptance
 * criterion).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSession = vi.fn();
const setOrgSettings = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireSession: () => requireSession(),
}));
vi.mock("@/lib/db/org-settings", () => ({
  setOrgSettings: (...a: unknown[]) => setOrgSettings(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveAnalyticsSettingsAction } from "./actions";

describe("saveAnalyticsSettingsAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    setOrgSettings.mockReset();
  });

  it("AC: a MEMBER is denied (FORBIDDEN) and nothing is written", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(
      saveAnalyticsSettingsAction({ measurementId: "G-ABC1234", enabled: true }),
    ).rejects.toThrow("FORBIDDEN");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: an ADMIN persists a valid measurement ID + enabled flag to category 'analytics'", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await saveAnalyticsSettingsAction({ measurementId: "G-ABC1234", enabled: true });
    expect(setOrgSettings).toHaveBeenCalledWith("o1", "analytics", {
      measurementId: "G-ABC1234",
      enabled: true,
    });
  });

  it("AC: an ADMIN can clear the measurement ID (empty string is allowed, not a format error)", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await saveAnalyticsSettingsAction({ measurementId: "", enabled: false });
    expect(setOrgSettings).toHaveBeenCalledWith("o1", "analytics", {
      measurementId: "",
      enabled: false,
    });
  });

  it("AC: an ADMIN save with a malformed measurement ID is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await expect(
      saveAnalyticsSettingsAction({ measurementId: "not-valid", enabled: true }),
    ).rejects.toThrow("INVALID_MEASUREMENT_ID");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });
});
