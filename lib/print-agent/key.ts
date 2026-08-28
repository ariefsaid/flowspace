import { createHash, randomBytes } from "node:crypto";

export type GeneratedPrintAgentKey = { rawKey: string; keySelector: string; keyHash: string };

export function hashPrintAgentKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generatePrintAgentKey(): GeneratedPrintAgentKey {
  const keySelector = randomBytes(9).toString("base64url");
  const rawKey = `${keySelector}.${randomBytes(32).toString("base64url")}`;
  return { rawKey, keySelector, keyHash: hashPrintAgentKey(rawKey) };
}
