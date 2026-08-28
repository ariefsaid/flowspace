import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { printAgentRateLimitEvents } from "@/lib/db/schema";
import { createId } from "@paralleldrive/cuid2";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number };
const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 60;

/** Multiprocess-safe sliding window, serialized on the matched config row. */
export async function consumePrintAgentRateLimit(orgId: string, configId: string): Promise<RateLimitResult> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT id FROM print_agent_configs
      WHERE id = ${configId} AND org_id = ${orgId} AND is_active = true
      FOR UPDATE
    `);
    if (locked.length === 0) return { allowed: false, retryAfterSeconds: WINDOW_SECONDS };

    await tx.execute(sql`
      DELETE FROM print_agent_rate_limit_events
      WHERE config_id = ${configId} AND org_id = ${orgId}
        AND requested_at < now() - interval '60 seconds'
    `);
    const rows = await tx.execute(sql`
      SELECT count(*)::int AS count, min(requested_at) AS oldest
      FROM print_agent_rate_limit_events
      WHERE config_id = ${configId} AND org_id = ${orgId}
        AND requested_at >= now() - interval '60 seconds'
    `) as unknown as Array<{ count: number; oldest: Date | null }>;
    const count = Number(rows[0]?.count ?? 0);
    if (count >= MAX_REQUESTS) {
      const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : Date.now();
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_SECONDS * 1000 - Date.now()) / 1000)) };
    }
    await tx.insert(printAgentRateLimitEvents).values({ orgId, configId, id: createId(), requestedAt: new Date() });
    return { allowed: true };
  });
}
