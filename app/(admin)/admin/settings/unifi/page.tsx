/**
 * Admin UniFi settings — cloud/local connection config over a SIMULATED
 * "Uji Koneksi" (I-042, spec 0009 fan-out; real integration ships in I-045).
 * RSC: loads the org's "unifi" org_settings blob, defaults every field to ""
 * / cloud mode when no row exists yet (empty state). Secrets are NEVER
 * forwarded to the client verbatim — only a `hasApiKey`/`hasPassword`
 * boolean so the client can render the masked "tersimpan" placeholder.
 * ADMIN-only is enforced by middleware + the (admin) layout guard.
 */
import { requireSession } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/db/org-settings";
import { UnifiClient } from "./UnifiClient";
import type { UnifiSettingsInitial } from "./actions";

export default async function AdminUnifiSettingsPage() {
  const { orgId } = await requireSession();
  const raw = await getOrgSettings(orgId, "unifi");

  const initial: UnifiSettingsInitial = {
    connectionMode: raw.connectionMode === "local" ? "local" : "cloud",
    cloudConsoleUrl: typeof raw.cloudConsoleUrl === "string" ? raw.cloudConsoleUrl : "",
    consoleId: typeof raw.consoleId === "string" ? raw.consoleId : "",
    controllerHost: typeof raw.controllerHost === "string" ? raw.controllerHost : "",
    controllerPort: typeof raw.controllerPort === "string" ? raw.controllerPort : "",
    username: typeof raw.username === "string" ? raw.username : "",
    siteName: typeof raw.siteName === "string" ? raw.siteName : "default",
    hasApiKey: typeof raw.siteManagerApiKey === "string" && raw.siteManagerApiKey.length > 0,
    hasPassword: typeof raw.password === "string" && raw.password.length > 0,
  };

  return <UnifiClient initial={initial} />;
}
