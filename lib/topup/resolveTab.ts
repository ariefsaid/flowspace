import type { TabKey } from "@/app/(member)/topup/TopupClient";

/**
 * Maps the topup page's `?tab=` query param to its initial tab. Supports
 * `print` and the captured original's `papercut` alias (its print-balance
 * feature was named PaperCut); anything else (including a missing param)
 * falls back to `time`.
 */
export function resolveInitialTab(tabParam: string | string[] | undefined): TabKey {
  const value = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  return value === "print" || value === "papercut" ? "print" : "time";
}
