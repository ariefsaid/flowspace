import { timingSafeEqual } from "node:crypto";
import { getPrintAgentConfigBySelector } from "@/lib/db/print-agent";
import { hashPrintAgentKey } from "./key";
export { generatePrintAgentKey } from "./key";

const KEY_RE = /^([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/;


export function parsePrintAgentKey(raw: string | null): { keySelector: string; rawKey: string } | null {
  if (!raw) return null;
  const match = KEY_RE.exec(raw);
  return match ? { keySelector: match[1], rawKey: raw } : null;
}

/** Key-only auth for the print agent; browser sessions are intentionally absent. */
export async function authenticatePrintAgent(request: Request) {
  const parsed = parsePrintAgentKey(request.headers.get("x-api-key"));
  if (!parsed) throw new Error("UNAUTHORIZED");
  const config = await getPrintAgentConfigBySelector(parsed.keySelector);
  if (!config || !config.isActive) throw new Error("UNAUTHORIZED");

  const provided = Buffer.from(hashPrintAgentKey(parsed.rawKey), "hex");
  const expected = Buffer.from(config.keyHash, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("UNAUTHORIZED");
  }
  return config;
}
