"use server";
/**
 * Print server actions — member print-job submission (I-023).
 *
 * orgId + userId are always resolved server-side from the session; clients
 * never supply them (ADR-0004). Totals are computed server-side by
 * submitPrintJob from the loaded tier (FR-232, [SEC]).
 */
import { requireSession } from "@/lib/auth/session";
import { submitPrintJob } from "@/lib/db/print";
import type { PrintColorMode } from "@/lib/db/enums";

/**
 * Submit a print job for the signed-in member.
 *
 * FR-230, FR-231, FR-232 / AC-0234, AC-0235, AC-0236.
 */
export async function submitPrintJobAction(input: {
  fileName: string;
  pages: number;
  copies: number;
  colorMode: PrintColorMode;
  paperSize?: string;
  duplex?: boolean;
}) {
  const user = await requireSession();
  return submitPrintJob({
    orgId: user.orgId,
    userId: user.id,
    fileName: input.fileName,
    pages: input.pages,
    copies: input.copies,
    colorMode: input.colorMode,
    paperSize: input.paperSize,
    duplex: input.duplex,
  });
}
