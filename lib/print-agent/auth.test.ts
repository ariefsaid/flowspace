import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const getPrintAgentConfigBySelector = vi.fn();
vi.mock("@/lib/db/print-agent", () => ({ getPrintAgentConfigBySelector: (...args: unknown[]) => getPrintAgentConfigBySelector(...args) }));

import { authenticatePrintAgent, generatePrintAgentKey, parsePrintAgentKey } from "./auth";

describe("print-agent key auth", () => {
  beforeEach(() => getPrintAgentConfigBySelector.mockReset());

  it("generates a raw key once and stores only a selector and SHA-256 hash", () => {
    const key = generatePrintAgentKey();
    expect(key.rawKey).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(key.keySelector).toBe(key.rawKey.split(".")[0]);
    expect(key.keyHash).toBe(createHash("sha256").update(key.rawKey).digest("hex"));
  });

  it("rejects malformed keys before querying configuration", async () => {
    const request = new Request("http://localhost/api/print-agent/jobs", { headers: { "x-api-key": "bad" } });
    await expect(authenticatePrintAgent(request)).rejects.toThrow("UNAUTHORIZED");
    expect(getPrintAgentConfigBySelector).not.toHaveBeenCalled();
    expect(parsePrintAgentKey("bad")).toBeNull();
  });

  it("authenticates a matching active config and rejects a wrong secret", async () => {
    const key = generatePrintAgentKey();
    getPrintAgentConfigBySelector.mockResolvedValue({ keySelector: key.keySelector, keyHash: key.keyHash, isActive: true, orgId: "org-1" });
    const request = new Request("http://localhost/api/print-agent/jobs", { headers: { "x-api-key": key.rawKey } });
    await expect(authenticatePrintAgent(request)).resolves.toMatchObject({ orgId: "org-1" });
    const wrong = new Request("http://localhost/api/print-agent/jobs", { headers: { "x-api-key": `${key.keySelector}.wrongsecretwrongsecretwrongsecret` } });
    await expect(authenticatePrintAgent(wrong)).rejects.toThrow("UNAUTHORIZED");
  });
});
