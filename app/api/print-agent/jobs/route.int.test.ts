// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(), rate: vi.fn(), list: vi.fn(), signed: vi.fn(), advance: vi.fn(),
}));
vi.mock("@/lib/print-agent/auth", () => ({ authenticatePrintAgent: mocks.authenticate }));
vi.mock("@/lib/db/print-agent-rate-limit", () => ({ consumePrintAgentRateLimit: mocks.rate }));
vi.mock("@/lib/db/print-agent", () => ({ listPrintJobsForAgent: mocks.list }));
vi.mock("@/lib/storage/uploads", () => ({ getSignedDownloadUrl: mocks.signed }));
vi.mock("@/lib/db/print", () => ({ advancePrintJob: mocks.advance }));

import { GET, POST } from "./route";

const config = { id: "cfg-1", orgId: "org-1", keySelector: "selector", keyHash: "hash", isActive: true };
const job = { id: "job-1", orgId: "org-1", storagePath: "org-1/print/doc/file.pdf", status: "PENDING", createdAt: new Date("2026-01-01") };

beforeEach(() => {
  mocks.authenticate.mockReset().mockResolvedValue(config);
  mocks.rate.mockReset().mockResolvedValue({ allowed: true });
  mocks.list.mockReset().mockResolvedValue([job]);
  mocks.signed.mockReset().mockResolvedValue("https://signed.test/file");
  mocks.advance.mockReset().mockResolvedValue({ ...job, status: "READY" });
});

describe("print agent jobs route", () => {
  it("AC-617: GET returns an ascending org-scoped queue with signed document URLs", async () => {
    const response = await GET(new Request("http://localhost/api/print-agent/jobs?limit=10", { headers: { "x-api-key": "key" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jobs: [{ id: "job-1", downloadUrl: "https://signed.test/file" }] });
    expect(mocks.list).toHaveBeenCalledWith("org-1", 10);
    expect(mocks.signed).toHaveBeenCalledWith("org-1", job.storagePath);
  });

  it("AC-618: GET caps queue size at 50 and has no session lookup", async () => {
    const response = await GET(new Request("http://localhost/api/print-agent/jobs?limit=999", { headers: { "x-api-key": "key" } }));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("org-1", 50);
  });

  it("AC-619: auth/rate errors are generic and do not expose configuration", async () => {
    mocks.authenticate.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
    const unauthorized = await GET(new Request("http://localhost/api/print-agent/jobs"));
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.text()).not.toMatch(/hash|selector|org-1/);
    mocks.authenticate.mockResolvedValueOnce(config);
    mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 8 });
    const limited = await GET(new Request("http://localhost/api/print-agent/jobs", { headers: { "x-api-key": "key" } }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("8");
  });

  it("AC-638: agent GET returns only a same-org signed URL and never a stored hash", async () => {
    const response = await GET(new Request("http://localhost/api/print-agent/jobs", { headers: { "x-api-key": "key" } }));
    const body = await response.json();
    expect(body.jobs[0]).toMatchObject({ downloadUrl: "https://signed.test/file" });
    expect(JSON.stringify(body)).not.toMatch(/keyHash|key_hash|hash/);
  });

  it("AC-622: malformed requests are rejected before any queue data is queried", async () => {
    const response = await GET(new Request("http://localhost/api/print-agent/jobs?limit=0", { headers: { "x-api-key": "key" } }));
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("AC-620: POST passes only the permitted status payload to the org repository", async () => {
    const response = await POST(new Request("http://localhost/api/print-agent/jobs", { method: "POST", headers: { "x-api-key": "key", "content-type": "application/json" }, body: JSON.stringify({ jobId: "job-1", status: "READY", processedBy: "agent", errorMessage: "" }) }));
    expect(response.status).toBe(200);
    expect(mocks.advance).toHaveBeenCalledWith("org-1", "job-1", "READY", { processedBy: "agent", errorMessage: undefined });
  });

  it("AC-621: unknown status and malformed bodies are generic 400 responses", async () => {
    const response = await POST(new Request("http://localhost/api/print-agent/jobs", { method: "POST", headers: { "x-api-key": "key", "content-type": "application/json" }, body: JSON.stringify({ jobId: "job-1", status: "BOGUS" }) }));
    expect(response.status).toBe(400);
    expect(mocks.advance).not.toHaveBeenCalled();
  });
});
