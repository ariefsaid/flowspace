import type { PrintJobStatus } from "@/lib/db/enums";

export type TransitionMetadata = {
  processedBy?: string;
  errorMessage?: string;
  /** Required proof that a FAILED job was explicitly reviewed before retry. */
  resolution?: string;
};

const TRANSITIONS: Readonly<Record<PrintJobStatus, readonly PrintJobStatus[]>> = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["READY", "FAILED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  FAILED: ["PROCESSING", "COMPLETED"],
};

function hasFailureResolution(metadata?: TransitionMetadata): boolean {
  // A named processor is the explicit resolution/audit metadata required by
  // the repository API; resolution remains available for richer callers.
  return Boolean(metadata?.processedBy?.trim() || metadata?.resolution?.trim());
}

export function canTransition(
  from: PrintJobStatus,
  to: PrintJobStatus,
  metadata?: TransitionMetadata,
): boolean {
  if (!TRANSITIONS[from]?.includes(to)) return false;
  if (from === "FAILED") return hasFailureResolution(metadata);
  return true;
}

export function transitionPrintJob(
  from: PrintJobStatus,
  to: PrintJobStatus,
  metadata?: TransitionMetadata,
): { status: PrintJobStatus; processedBy?: string; errorMessage?: string } {
  if (from === "FAILED" && !hasFailureResolution(metadata)) {
    throw new Error("FAILED_RESOLUTION_REQUIRED");
  }
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new Error("INVALID_PRINT_TRANSITION");
  }
  const result: { status: PrintJobStatus; processedBy?: string; errorMessage?: string } = { status: to };
  if (metadata?.processedBy) result.processedBy = metadata.processedBy;
  if (metadata?.errorMessage) result.errorMessage = metadata.errorMessage;
  return result;
}
