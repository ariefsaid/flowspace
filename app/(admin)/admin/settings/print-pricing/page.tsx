/**
 * Admin print-pricing matrix — "Harga Print" (I-042, spec 0009). RSC: loads
 * the org's print-price matrix rows, renders the 6-cell editor. ADMIN-only
 * is enforced by middleware + the (admin) layout guard.
 */
import { requireSession } from "@/lib/auth/session";
import { listPrintPricing } from "@/lib/db/print-pricing";
import { PrintPricingClient } from "./PrintPricingClient";
import { toMatrixCells } from "./toMatrixCells";

export default async function AdminPrintPricingPage() {
  const { orgId } = await requireSession();
  const rows = await listPrintPricing(orgId);
  return <PrintPricingClient cells={toMatrixCells(rows)} />;
}
