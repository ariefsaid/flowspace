/**
 * UniFi settings actions (I-042, spec 0009 fan-out). ADMIN-only. Save merges
 * the edited payload with the previously stored secrets (siteManagerApiKey /
 * password are only overwritten when the caller actually sends a new value —
 * `undefined` means "keep what's already stored", never re-sent verbatim).
 * The test action is a SIMULATED result (no network call, I-045 ships the
 * real integration) — each `it()` title names its own owning acceptance
 * criterion.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSession = vi.fn();
const getOrgSettings = vi.fn();
const setOrgSettings = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireSession: () => requireSession(),
}));
vi.mock("@/lib/db/org-settings", () => ({
  getOrgSettings: (...a: unknown[]) => getOrgSettings(...a),
  setOrgSettings: (...a: unknown[]) => setOrgSettings(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  saveUnifiSettingsAction,
  testUnifiConnectionAction,
  type UnifiSaveInput,
  type UnifiTestInput,
} from "./actions";

const cloudInput: UnifiSaveInput = {
  connectionMode: "cloud",
  cloudConsoleUrl: "https://unifi.ui.com/consoles/ABC123/network/default/dashboard",
  consoleId: "ABC123",
  controllerHost: "",
  controllerPort: "",
  username: "ops@example.com",
  siteName: "default",
};

describe("saveUnifiSettingsAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    getOrgSettings.mockReset();
    getOrgSettings.mockResolvedValue({});
    setOrgSettings.mockReset();
  });

  it("AC: a MEMBER is denied (FORBIDDEN) and nothing is written", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(saveUnifiSettingsAction(cloudInput)).rejects.toThrow("FORBIDDEN");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: an ADMIN saving cloud mode with a well-formed URL + consoleId persists to category 'unifi' with the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await saveUnifiSettingsAction({ ...cloudInput, siteManagerApiKey: "key-123" });
    expect(setOrgSettings).toHaveBeenCalledWith(
      "o1",
      "unifi",
      expect.objectContaining({ connectionMode: "cloud", cloudConsoleUrl: cloudInput.cloudConsoleUrl, siteManagerApiKey: "key-123" }),
    );
  });

  it("AC: a malformed cloud console URL is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await expect(
      saveUnifiSettingsAction({ ...cloudInput, cloudConsoleUrl: "not-a-url" }),
    ).rejects.toThrow("INVALID_URL:cloudConsoleUrl");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("[SEC] AC: a non-https cloud console URL is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await expect(
      saveUnifiSettingsAction({
        ...cloudInput,
        cloudConsoleUrl: "http://unifi.ui.com/consoles/ABC123/network/default/dashboard",
      }),
    ).rejects.toThrow("INVALID_URL:cloudConsoleUrl");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("[SEC] AC: a cloud console URL pointing at an internal/metadata host is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await expect(
      saveUnifiSettingsAction({
        ...cloudInput,
        cloudConsoleUrl: "https://169.254.169.254/latest/meta-data",
      }),
    ).rejects.toThrow("INVALID_URL:cloudConsoleUrl");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: cloud mode with no consoleId detected is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await expect(
      saveUnifiSettingsAction({ ...cloudInput, consoleId: "" }),
    ).rejects.toThrow("REQUIRED:consoleId");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: local mode with an invalid host is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await expect(
      saveUnifiSettingsAction({
        ...cloudInput,
        connectionMode: "local",
        cloudConsoleUrl: "",
        consoleId: "",
        controllerHost: "not valid host!",
      }),
    ).rejects.toThrow("INVALID_HOST:controllerHost");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: local mode with an out-of-range port is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await expect(
      saveUnifiSettingsAction({
        ...cloudInput,
        connectionMode: "local",
        cloudConsoleUrl: "",
        consoleId: "",
        controllerHost: "192.168.1.1",
        controllerPort: "70000",
      }),
    ).rejects.toThrow("INVALID_PORT:controllerPort");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: a field over 500 chars is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await expect(
      saveUnifiSettingsAction({ ...cloudInput, username: "x".repeat(501) }),
    ).rejects.toThrow("INVALID_LENGTH:username");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("[SEC] AC: a consoleId over 500 chars is rejected, no write", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await expect(
      saveUnifiSettingsAction({ ...cloudInput, consoleId: "x".repeat(501) }),
    ).rejects.toThrow("INVALID_LENGTH:consoleId");
    expect(setOrgSettings).not.toHaveBeenCalled();
  });

  it("AC: omitting siteManagerApiKey (unedited) keeps the previously stored secret, never re-sending it as an explicit value", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    getOrgSettings.mockResolvedValue({ siteManagerApiKey: "already-stored-key" });
    await saveUnifiSettingsAction(cloudInput); // no siteManagerApiKey field
    expect(setOrgSettings).toHaveBeenCalledWith(
      "o1",
      "unifi",
      expect.objectContaining({ siteManagerApiKey: "already-stored-key" }),
    );
  });

  it("AC: an explicitly-edited siteManagerApiKey overwrites the previously stored secret", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    getOrgSettings.mockResolvedValue({ siteManagerApiKey: "old-key" });
    await saveUnifiSettingsAction({ ...cloudInput, siteManagerApiKey: "new-key" });
    expect(setOrgSettings).toHaveBeenCalledWith(
      "o1",
      "unifi",
      expect.objectContaining({ siteManagerApiKey: "new-key" }),
    );
  });
});

const cloudTestInput: UnifiTestInput = {
  connectionMode: "cloud",
  cloudConsoleUrl: "https://unifi.ui.com/consoles/ABC123/network/default/dashboard",
  consoleId: "ABC123",
  apiKeyProvided: true,
  controllerHost: "",
  controllerPort: "",
  username: "",
  passwordProvided: false,
};

describe("testUnifiConnectionAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
  });

  it("AC: a MEMBER is denied (FORBIDDEN)", async () => {
    requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
    await expect(testUnifiConnectionAction(cloudTestInput)).rejects.toThrow("FORBIDDEN");
  });

  it("AC: cloud mode with URL + API key + detected consoleId simulates success", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const result = await testUnifiConnectionAction(cloudTestInput);
    expect(result.outcome).toBe("success");
  });

  it("AC: cloud mode with a valid API key but no detected consoleId simulates partial success", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const result = await testUnifiConnectionAction({ ...cloudTestInput, consoleId: "" });
    expect(result.outcome).toBe("partial");
  });

  it("AC: cloud mode missing the API key simulates failure", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const result = await testUnifiConnectionAction({ ...cloudTestInput, apiKeyProvided: false });
    expect(result.outcome).toBe("failed");
  });

  it("AC: local mode with host + username + password simulates success", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const result = await testUnifiConnectionAction({
      connectionMode: "local",
      cloudConsoleUrl: "",
      consoleId: "",
      apiKeyProvided: false,
      controllerHost: "192.168.1.1",
      controllerPort: "8443",
      username: "admin",
      passwordProvided: true,
    });
    expect(result.outcome).toBe("success");
  });

  it("AC: local mode with an out-of-range port simulates failure", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    const result = await testUnifiConnectionAction({
      connectionMode: "local",
      cloudConsoleUrl: "",
      consoleId: "",
      apiKeyProvided: false,
      controllerHost: "192.168.1.1",
      controllerPort: "99999",
      username: "admin",
      passwordProvided: true,
    });
    expect(result.outcome).toBe("failed");
  });
});
