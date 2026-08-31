/**
 * saveEmailSettingsAction denies non-ADMIN callers (no write), persists the
 * toggle + sender-name payload for an ADMIN with the session orgId, and
 * rejects an oversized sender name before any write (each `it()` title names
 * its own owning acceptance criterion).
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

import { saveEmailSettingsAction, type EmailSettingsInput } from "./actions";

const input: EmailSettingsInput = {
  senderName: "FlowSpace",
  registrationEnabled: true,
  bookingEnabled: true,
  paymentEnabled: false,
};

describe("saveEmailSettingsAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    setOrgSettings.mockReset();
  });

  it("AC: a MEMBER is denied (FORBIDDEN) and nothing is written", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(saveEmailSettingsAction(input)).rejects.toThrow("FORBIDDEN");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: an ADMIN persists the toggle + sender-name payload to category 'email' with the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await saveEmailSettingsAction(input);
    expect(setOrgSettings).toHaveBeenCalledWith("o1", "email", input);
  });

  it("AC: an ADMIN save with a sender name over 500 chars is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const tooLong = { ...input, senderName: "x".repeat(501) };
    await expect(saveEmailSettingsAction(tooLong)).rejects.toThrow("INVALID_LENGTH:senderName");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("[SEC] AC: an unknown/huge extra key on the payload is never persisted (allowlisted, not spread through)", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const withExtra = { ...input, evilProp: "x".repeat(100_000) } as EmailSettingsInput & {
      evilProp: string;
    };
    await saveEmailSettingsAction(withExtra);
    const persisted = setOrgSettings.mock.calls[0]?.[2];
    expect(persisted).not.toHaveProperty("evilProp");
    expect(persisted).toEqual(input);
  });
});
