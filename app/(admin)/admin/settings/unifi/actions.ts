"use server";
/**
 * Admin UniFi-settings actions (I-042, spec 0009 fan-out). ADMIN-only. The
 * real UniFi controller integration ships in I-045 — `testUnifiConnectionAction`
 * makes NO network call; it validates the submitted shape and returns a
 * deterministic mock result. `saveUnifiSettingsAction` persists to
 * org_settings category "unifi" and never re-stores a secret the caller
 * didn't actually edit: `siteManagerApiKey` / `password` are `undefined` when
 * unedited, and the previously-stored value is merged back in from
 * `getOrgSettings` rather than round-tripped through the client.
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getOrgSettings, setOrgSettings } from "@/lib/db/org-settings";
import { assertSafeHttpsUrl } from "../url-guard";

export type UnifiConnectionMode = "cloud" | "local";

export type UnifiSettingsInitial = {
  connectionMode: UnifiConnectionMode;
  cloudConsoleUrl: string;
  consoleId: string;
  controllerHost: string;
  controllerPort: string;
  username: string;
  siteName: string;
  hasApiKey: boolean;
  hasPassword: boolean;
};

export type UnifiSaveInput = {
  connectionMode: UnifiConnectionMode;
  cloudConsoleUrl: string;
  consoleId: string;
  controllerHost: string;
  controllerPort: string;
  username: string;
  siteName: string;
  /** undefined = keep the previously stored secret unchanged (not edited) */
  siteManagerApiKey?: string;
  /** undefined = keep the previously stored secret unchanged (not edited) */
  password?: string;
};

export type UnifiTestInput = {
  connectionMode: UnifiConnectionMode;
  cloudConsoleUrl: string;
  consoleId: string;
  apiKeyProvided: boolean;
  controllerHost: string;
  controllerPort: string;
  username: string;
  passwordProvided: boolean;
};

export type UnifiTestOutcome = "success" | "partial" | "failed";
export type UnifiTestResult = { outcome: UnifiTestOutcome; message: string };

const MAX_LEN = 500;
const URL_PATTERN = /^https?:\/\/.+/i;
// Simple hostname/IPv4 sanity check (letters, digits, dots, dashes) — this is
// a SIMULATED shape check, not a real reachability probe (I-045).
const HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;
const TEST_DELAY_MS = 400;

function assertLen(value: string, field: string) {
  if (value.length > MAX_LEN) throw new Error(`INVALID_LENGTH:${field}`);
}

function assertPort(port: string) {
  if (!port) return;
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error("INVALID_PORT:controllerPort");
  }
}

function isPortValid(port: string): boolean {
  if (!port) return true;
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

export async function saveUnifiSettingsAction(input: UnifiSaveInput): Promise<void> {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  assertLen(input.cloudConsoleUrl, "cloudConsoleUrl");
  assertLen(input.controllerHost, "controllerHost");
  assertLen(input.username, "username");
  assertLen(input.siteName, "siteName");
  if (input.siteManagerApiKey !== undefined) assertLen(input.siteManagerApiKey, "siteManagerApiKey");
  if (input.password !== undefined) assertLen(input.password, "password");

  if (input.connectionMode === "cloud") {
    if (!input.cloudConsoleUrl) {
      throw new Error("INVALID_URL:cloudConsoleUrl");
    }
    // [SEC] require https:// and reject an obviously-internal/metadata host
    // (finding 5) — no outbound call happens here (I-045), this just
    // tightens the stored shape.
    assertSafeHttpsUrl(input.cloudConsoleUrl, "cloudConsoleUrl");
    if (!input.consoleId) {
      throw new Error("REQUIRED:consoleId");
    }
  } else {
    if (!input.controllerHost || !HOST_PATTERN.test(input.controllerHost)) {
      throw new Error("INVALID_HOST:controllerHost");
    }
    assertPort(input.controllerPort);
  }

  const existing = await getOrgSettings(user.orgId, "unifi");
  const merged = {
    connectionMode: input.connectionMode,
    cloudConsoleUrl: input.cloudConsoleUrl,
    consoleId: input.consoleId,
    controllerHost: input.controllerHost,
    controllerPort: input.controllerPort,
    username: input.username,
    siteName: input.siteName,
    siteManagerApiKey:
      input.siteManagerApiKey !== undefined
        ? input.siteManagerApiKey
        : typeof existing.siteManagerApiKey === "string"
          ? existing.siteManagerApiKey
          : "",
    password:
      input.password !== undefined
        ? input.password
        : typeof existing.password === "string"
          ? existing.password
          : "",
  };

  await setOrgSettings(user.orgId, "unifi", merged);
  revalidatePath("/admin/settings/unifi");
}

/**
 * Simulated connection test — NO network call. Validates the submitted shape
 * and returns a deterministic mock result after a brief pending delay. The
 * real UniFi controller call ships in I-045.
 */
export async function testUnifiConnectionAction(input: UnifiTestInput): Promise<UnifiTestResult> {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

  if (input.connectionMode === "cloud") {
    if (!input.cloudConsoleUrl || !URL_PATTERN.test(input.cloudConsoleUrl) || !input.apiKeyProvided) {
      return { outcome: "failed", message: "Console URL dan Site Manager API Key harus diisi dengan benar." };
    }
    if (!input.consoleId) {
      return {
        outcome: "partial",
        message: "API Key valid, tapi Console ID tidak terdeteksi — proxy belum ter-adopt.",
      };
    }
    return { outcome: "success", message: "Simulasi: semua komponen terhubung." };
  }

  if (!input.controllerHost || !HOST_PATTERN.test(input.controllerHost) || !input.username || !input.passwordProvided) {
    return { outcome: "failed", message: "Host, username, dan password harus diisi dengan benar." };
  }
  if (!isPortValid(input.controllerPort)) {
    return { outcome: "failed", message: "Port harus berupa angka 1-65535." };
  }
  return { outcome: "success", message: "Simulasi: koneksi ke controller berhasil." };
}
