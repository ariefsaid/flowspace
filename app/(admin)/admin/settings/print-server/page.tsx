import { requireSession } from "@/lib/auth/session";
import { getPrintAgentConfig } from "@/lib/db/print-agent";
import { PrintServerClient, type PrintServerConfigView } from "./PrintServerClient";

export default async function PrintServerPage() {
  const user = await requireSession();
  const config = await getPrintAgentConfig(user.orgId);
  const view: PrintServerConfigView | null = config ? {
    id: config.id,
    keySelector: config.keySelector,
    serverName: config.serverName,
    isActive: config.isActive,
    lastSeenAt: config.lastSeenAt?.toISOString() ?? null,
  } : null;
  return <PrintServerClient config={view} />;
}
