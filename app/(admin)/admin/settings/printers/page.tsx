/**
 * Admin printers page (I-043, spec 0009). RSC.
 * ADMIN-only is enforced by middleware + the (admin) layout guard; the printer
 * ACTIONS additionally re-check the role in-body. Loads ALL org printers
 * (incl. archived) for the CRUD table.
 */
import { requireSession } from "@/lib/auth/session";
import { listPrintersForAdmin } from "@/lib/db/printers";
import { PrintersClient, type PrinterRow } from "./PrintersClient";

export default async function AdminPrintersPage() {
  const { orgId } = await requireSession();
  const printers = await listPrintersForAdmin(orgId);

  const rows: PrinterRow[] = printers.map((p) => ({
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    location: p.location,
    printerType: p.printerType,
    colorSupport: p.colorSupport,
    paperSizes: p.paperSizes,
    isActive: p.isActive,
    isDefault: p.isDefault,
    sortOrder: p.sortOrder,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
  }));

  return <PrintersClient printers={rows} />;
}
