/**
 * Member top-up page — server component.
 * Reads available packages + the member's balances (org-scoped) and passes
 * them to TopupClient (the pixel-identical client leaf). The client only sends
 * the chosen packageId / pages back via server actions; balances + prices come
 * from the server, never the client. I-020 / [SEC].
 */
import { requireSession } from "@/lib/auth/session";
import { listPackages } from "@/lib/db/packages";
import { findById } from "@/lib/db/users";
import { TopupClient } from "./TopupClient";
import type { PackageView } from "./TopupClient";

export default async function TopUpPage() {
  const user = await requireSession();
  const [packages, profile] = await Promise.all([
    listPackages(user.orgId),
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

  return (
    <TopupClient
      packages={packageViews}
      timeCredits={profile?.timeCredits ?? 0}
      printBalance={profile?.printBalance ?? 0}
    />
  );
}
