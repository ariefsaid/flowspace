import { authenticatePrintAgent } from "@/lib/print-agent/auth";
import { consumePrintAgentRateLimit } from "@/lib/db/print-agent-rate-limit";
import { listPrintJobsForAgent } from "@/lib/db/print-agent";
import { advancePrintJob } from "@/lib/db/print";
import { getSignedDownloadUrl } from "@/lib/storage/uploads";
import type { PrintJobStatus } from "@/lib/db/enums";

// PENDING is assigned server-side at job creation only; the agent may never
// set a job back to PENDING. Restricting the POST body to this set turns an
// invalid transition into a clean 400 here instead of falling through to
// advancePrintJob and 500ing on INVALID_PRINT_TRANSITION.
const AGENT_SETTABLE_STATUSES: readonly PrintJobStatus[] = ["PROCESSING", "READY", "COMPLETED", "FAILED"];
const json = (body: object, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });

function parseLimit(request: Request): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null) return 10;
  if (!/^\d+$/.test(raw)) throw new Error("BAD_LIMIT");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("BAD_LIMIT");
  return Math.min(value, 50);
}

function authError(): Response { return json({ error: "Unauthorized" }, 401); }

export async function GET(request: Request) {
  let config;
  try {
    config = await authenticatePrintAgent(request);
  } catch {
    return authError();
  }
  let limit: number;
  try { limit = parseLimit(request); } catch { return json({ error: "Bad request" }, 400); }
  try {
    const rate = await consumePrintAgentRateLimit(config.orgId, config.id);
    if (!rate.allowed) return json({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfterSeconds ?? 60) });
    const jobs = await listPrintJobsForAgent(config.orgId, limit);
    const responseJobs = await Promise.all(jobs.map(async (job) => ({
      id: job.id,
      fileName: job.fileName,
      pages: job.pages,
      totalPages: job.totalPages,
      copies: job.copies,
      colorMode: job.colorMode,
      paperSize: job.paperSize,
      duplex: job.duplex,
      status: job.status,
      pageRange: job.pageRange,
      createdAt: job.createdAt.toISOString(),
      downloadUrl: job.storagePath ? await getSignedDownloadUrl(config.orgId, job.storagePath) : null,
    })));
    return json({ jobs: responseJobs });
  } catch {
    return json({ error: "Unable to load print jobs" }, 500);
  }
}

export async function POST(request: Request) {
  let config;
  try { config = await authenticatePrintAgent(request); } catch { return authError(); }
  try {
    const rate = await consumePrintAgentRateLimit(config.orgId, config.id);
    if (!rate.allowed) return json({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfterSeconds ?? 60) });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("BAD_BODY");
    const input = body as Record<string, unknown>;
    if (typeof input.jobId !== "string" || !input.jobId.trim() || typeof input.status !== "string" || !AGENT_SETTABLE_STATUSES.includes(input.status as PrintJobStatus)) throw new Error("BAD_BODY");
    if (input.processedBy !== undefined && typeof input.processedBy !== "string") throw new Error("BAD_BODY");
    if (input.errorMessage !== undefined && typeof input.errorMessage !== "string") throw new Error("BAD_BODY");
    await advancePrintJob(config.orgId, input.jobId, input.status as PrintJobStatus, {
      processedBy: typeof input.processedBy === "string" && input.processedBy ? input.processedBy : undefined,
      errorMessage: typeof input.errorMessage === "string" && input.errorMessage ? input.errorMessage : undefined,
    });
    return json({ ok: true, jobId: input.jobId, status: input.status });
  } catch (error) {
    if (error instanceof Error && error.message === "BAD_BODY") return json({ error: "Bad request" }, 400);
    return json({ error: "Unable to update print job" }, 500);
  }
}
