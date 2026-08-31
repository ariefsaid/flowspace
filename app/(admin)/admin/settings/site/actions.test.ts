/**
 * saveSiteSettingsAction denies non-ADMIN callers (no write), persists the
 * full site/SEO/social payload for an ADMIN with the session orgId, and
 * rejects an oversized field before any write (each `it()` title names its
 * own owning acceptance criterion).
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

import { saveSiteSettingsAction, type SiteSettingsInput } from "./actions";

const input: SiteSettingsInput = {
  name: "FlowSpace",
  tagline: "Coworking & Cafe",
  address: "Jl. Contoh No. 1",
  phone: "021-1234567",
  openingHours: "Senin - Jumat: 08:00 - 22:00",
  seoTitle: "FlowSpace — Coworking & Cafe",
  seoDescription: "Ruang kerja bersama dan cafe.",
  socialInstagram: "https://instagram.com/flowspace",
  socialFacebook: "https://facebook.com/flowspace",
  socialWhatsapp: "https://wa.me/628123456789",
};

describe("saveSiteSettingsAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    setOrgSettings.mockReset();
  });

  it("AC: a MEMBER is denied (FORBIDDEN) and nothing is written", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(saveSiteSettingsAction(input)).rejects.toThrow("FORBIDDEN");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: an ADMIN persists the full payload to category 'site' with the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await saveSiteSettingsAction(input);
    expect(setOrgSettings).toHaveBeenCalledWith("o1", "site", input);
  });

  it("AC: an ADMIN save with a field over 500 chars is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const tooLong = { ...input, address: "x".repeat(501) };
    await expect(saveSiteSettingsAction(tooLong)).rejects.toThrow("INVALID_LENGTH:address");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: an ADMIN can leave a social link blank (not a format error)", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const blank = { ...input, socialInstagram: "", socialFacebook: "", socialWhatsapp: "" };
    await saveSiteSettingsAction(blank);
    expect(setOrgSettings).toHaveBeenCalledWith("o1", "site", blank);
  });

  it("[SEC] AC: a non-https social link is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const badScheme = { ...input, socialInstagram: "http://instagram.com/flowspace" };
    await expect(saveSiteSettingsAction(badScheme)).rejects.toThrow(
      "INVALID_URL:socialInstagram",
    );
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("[SEC] AC: a social link pointing at an internal host is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const badHost = { ...input, socialFacebook: "https://169.254.169.254/latest/meta-data" };
    await expect(saveSiteSettingsAction(badHost)).rejects.toThrow("INVALID_URL:socialFacebook");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("[SEC] AC: an unknown/huge extra key on the payload is never persisted (allowlisted, not spread through)", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const withExtra = { ...input, evilProp: "x".repeat(100_000) } as SiteSettingsInput & {
      evilProp: string;
    };
    await saveSiteSettingsAction(withExtra);
    const persisted = setOrgSettings.mock.calls[0]?.[2];
    expect(persisted).not.toHaveProperty("evilProp");
    expect(persisted).toEqual(input);
  });
});
