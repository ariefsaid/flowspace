// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { organizations, printAgentConfigs, printAgentRateLimitEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { consumePrintAgentRateLimit } from "./print-agent-rate-limit";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:34322/postgres", { prepare: false, max: 3 });
const db = drizzle(sql, { schema });
let orgId: string;
let configId: string;

beforeAll(async () => {
  await sql`TRUNCATE TABLE print_agent_rate_limit_events, print_agent_configs, organizations RESTART IDENTITY CASCADE`;
  const [org] = await db.insert(organizations).values({ name: "Rate Org", slug: "rate-org" }).returning();
  orgId = org.id;
  const [config] = await db.insert(printAgentConfigs).values({ orgId, keySelector: "rate-selector", keyHash: "hash", isActive: true }).returning();
  configId = config.id;
});
afterAll(async () => { await sql`TRUNCATE TABLE print_agent_rate_limit_events, print_agent_configs, organizations RESTART IDENTITY CASCADE`; await sql.end(); });

describe("print-agent sliding-window guard", () => {
  it("allows 60 calls and rejects the 61st within one minute", async () => {
    for (let i = 0; i < 60; i++) expect((await consumePrintAgentRateLimit(orgId, configId)).allowed).toBe(true);
    const rejected = await consumePrintAgentRateLimit(orgId, configId);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("cleans old events and does not disclose key or job data", async () => {
    await sql`DELETE FROM print_agent_rate_limit_events`;
    await sql`INSERT INTO print_agent_rate_limit_events (id, org_id, config_id, requested_at) VALUES ('old-event', ${orgId}, ${configId}, now() - interval '2 minutes')`;
    const result = await consumePrintAgentRateLimit(orgId, configId);
    expect(result.allowed).toBe(true);
    const events = await db.select().from(printAgentRateLimitEvents).where(eq(printAgentRateLimitEvents.configId, configId));
    expect(events.some((event) => event.id === "old-event")).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/hash|selector|job/i);
  });
});
