"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createPrintAgentConfig, rotatePrintAgentKey } from "@/lib/db/print-agent";

const PATH = "/admin/settings/print-server";

export async function createPrintServerAction(input: { serverName?: string | null } = {}) {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  const result = await createPrintAgentConfig(user.orgId, { serverName: input.serverName });
  revalidatePath(PATH);
  return result;
}

export async function rotatePrintServerAction() {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  const result = await rotatePrintAgentKey(user.orgId);
  revalidatePath(PATH);
  return result;
}
