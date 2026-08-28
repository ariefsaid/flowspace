/** Member print page: bounded server reads and capability data. */
import { requireSession } from "@/lib/auth/session";
import { findById } from "@/lib/db/users";
import { listPrintJobsByUser } from "@/lib/db/print";
import { listActivePrinters } from "@/lib/db/printers";
import { listPrintPricing } from "@/lib/db/print-pricing";
import { getTierDiscounts } from "@/lib/db/tier-config";
import { PrintClient, type PricingView, type PrinterView } from "./PrintClient";

export default async function PrintPage() {
  const user = await requireSession();
  const profile = await findById(user.orgId, user.id);
  const [jobs, activePrinters, pricing, tierDiscounts] = await Promise.all([
    listPrintJobsByUser(user.orgId, user.id),
    listActivePrinters(user.orgId),
    listPrintPricing(user.orgId),
    getTierDiscounts(user.orgId, profile?.membershipTier ?? "REGULAR"),
  ]);

  const printerViews: PrinterView[] = activePrinters.map((printer) => ({
    id: printer.id,
    name: printer.name,
    displayName: printer.displayName,
    location: printer.location,
    printerType: printer.printerType,
    colorSupport: printer.colorSupport,
    paperSizes: printer.paperSizes,
    isActive: printer.isActive,
    isDefault: printer.isDefault,
  }));
  const pricingViews: PricingView[] = pricing.map((row) => ({
    colorMode: row.colorMode,
    paperSize: row.paperSize as PricingView["paperSize"],
    pricePerPageRupiah: row.pricePerPageRupiah,
    isActive: row.isActive,
  }));

  return (
    <PrintClient
      printBalance={profile?.printBalance ?? 0}
      jobs={jobs.map((job) => ({
        id: job.id,
        filename: job.fileName,
        pages: job.pages,
        totalPages: job.totalPages,
        price: job.totalRupiah,
        status: job.status,
        datetime: job.createdAt.toISOString(),
        printerName: job.printerDisplayName,
      }))}
      printers={printerViews}
      pricing={pricingViews}
      discountPct={tierDiscounts.printDiscountPct}
    />
  );
}
