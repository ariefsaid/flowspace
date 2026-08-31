/**
 * Member top-up page — server component.
 * Reads available packages + the member's balances (org-scoped) and passes
 * them to TopupClient (the pixel-identical client leaf). The client only sends
 * the chosen packageId / pages back via server actions; balances + prices come
 * from the server, never the client. I-020 / [SEC].
 */
import { requireSession } from "@/lib/auth/session";
import { listPackages } from "@/lib/db/packages";
import { listPrintTopupPackages } from "@/lib/db/print-packages";
import { findById } from "@/lib/db/users";
import { resolveInitialTab } from "@/lib/topup/resolveTab";
import { TopupClient } from "./TopupClient";
import type { PackageView, PrintPackageView } from "./TopupClient";

export default async function TopUpPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const user = await requireSession();
  const initialTab = resolveInitialTab((await searchParams).tab);
  const [packages, printPackages, profile] = await Promise.all([
    listPackages(user.orgId),
    listPrintTopupPackages(user.orgId),
    findById(user.orgId, user.id),
  ]);

  const packageViews: PackageView[] = packages.map((p) => ({
    id: p.id,
    name: p.name,
    hours: p.hours,
    priceRupiah: p.priceRupiah,
    pricePerHourRupiah: p.pricePerHourRupiah,
    popular: p.popular,
  }));

  const printPackageViews: PrintPackageView[] = printPackages.map((pkg) => ({
    id: pkg.id,
    pages: pkg.pages,
    priceRupiah: pkg.priceRupiah,
    sortOrder: pkg.sortOrder,
  }));

  return (
    <TopupClient
      packages={packageViews}
      printPackages={printPackageViews}
      timeCredits={profile?.timeCredits ?? 0}
      printBalance={profile?.printBalance ?? 0}
      initialTab={initialTab}
    />
  );
}
