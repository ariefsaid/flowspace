"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { advancePrintJob } from "@/lib/db/print";
import type { PrintJobStatus } from "@/lib/db/enums";

export async function advancePrintJobAction(input: {
  jobId: string;
  status: PrintJobStatus;
  processedBy?: string;
  errorMessage?: string;
}): Promise<void> {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  if (!["PENDING", "PROCESSING", "READY", "COMPLETED", "FAILED"].includes(input.status)) {
    throw new Error("INVALID_STATUS");
  }
  await advancePrintJob(user.orgId, input.jobId, input.status, {
    processedBy: input.processedBy,
    errorMessage: input.errorMessage,
  });
  revalidatePath("/admin/print-reports");
}
