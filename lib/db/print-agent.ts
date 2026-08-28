import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { printAgentConfigs, printJobs, type PrintAgentConfig, type PrintJob } from "@/lib/db/schema";
import { generatePrintAgentKey, type GeneratedPrintAgentKey } from "@/lib/print-agent/key";

export type PrintAgentConfigView = Omit<PrintAgentConfig, "keyHash">;

export function getPrintAgentConfigBySelector(selector: string): Promise<PrintAgentConfig | undefined> {
  return db.select().from(printAgentConfigs).where(eq(printAgentConfigs.keySelector, selector)).limit(1).then(([row]) => row);
}

export function getPrintAgentConfig(orgId: string): Promise<PrintAgentConfig | undefined> {
  return db.select().from(printAgentConfigs).where(eq(printAgentConfigs.orgId, orgId)).limit(1).then(([row]) => row);
}

export type PrintAgentKeyResult = { config: PrintAgentConfig; rawKey: string };

function mapDuplicate(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/duplicate|unique/i.test(message)) throw new Error("PRINT_AGENT_EXISTS");
  throw error;
}

export async function createPrintAgentConfig(
  orgId: string,
  input: { serverName?: string | null } = {},
): Promise<PrintAgentKeyResult> {
  const generated: GeneratedPrintAgentKey = generatePrintAgentKey();
  try {
    const [config] = await db.insert(printAgentConfigs).values({
      orgId,
      keySelector: generated.keySelector,
      keyHash: generated.keyHash,
      serverName: input.serverName?.trim() || null,
      isActive: true,
    }).returning();
    return { config, rawKey: generated.rawKey };
  } catch (error) {
    return mapDuplicate(error);
  }
}

export async function rotatePrintAgentKey(orgId: string): Promise<PrintAgentKeyResult> {
  const existing = await getPrintAgentConfig(orgId);
  if (!existing) throw new Error("NOT_FOUND");
  const generated = generatePrintAgentKey();
  const [config] = await db.update(printAgentConfigs).set({
    keySelector: generated.keySelector,
    keyHash: generated.keyHash,
    updatedAt: new Date(),
    isActive: true,
  }).where(eq(printAgentConfigs.orgId, orgId)).returning();
  return { config, rawKey: generated.rawKey };
}

export function listPrintJobsForAgent(orgId: string, limit: number): Promise<PrintJob[]> {
  return db.select().from(printJobs)
    .where(and(inArray(printJobs.status, ["PENDING", "PROCESSING"]), eq(printJobs.orgId, orgId)))
    .orderBy(asc(printJobs.createdAt), asc(printJobs.id))
    .limit(Math.min(Math.max(limit, 1), 50));
}
