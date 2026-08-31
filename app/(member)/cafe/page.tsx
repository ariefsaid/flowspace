/**
 * Member cafe page — server component.
 * Fetches menu from DB (org-scoped) and discount eligibility server-side.
 * Passes data as props to the CafeClient (client leaf).
 * FR-102 / AC-101
 */
import { requireSession } from "@/lib/auth/session";
import { resolveDiscountEligibility } from "@/lib/cafe/eligibility";
import { listMenu, listRecentOrdersByUser } from "@/lib/db/cafe";
import { findProfilesByIds } from "@/lib/db/users";
import { getTierDiscounts } from "@/lib/db/tier-config";
import { CafeClient } from "./CafeClient";
import type { MenuItemView, RecentOrderView } from "./CafeClient";
import type { CafeCategory } from "@/lib/db/enums";
import type { VariantOptionSnapshot } from "@/lib/cafe/types";

/** Map Prisma CafeCategory enum → the string our CafeClient understands. */
function mapCategory(cat: CafeCategory): string {
  return cat; // DB enum values are already COFFEE / NON_COFFEE / FOOD / SNACK
}

/** Formats the canonical option snapshots into "Group: Option, Group: Option" (I-044, FR-728). */
function formatVariantOptions(options: VariantOptionSnapshot[]): string | undefined {
  if (!options.length) return undefined;
  return options.map((o) => `${o.variantName}: ${o.optionName}`).join(", ");
}

export default async function CafePage() {
  const user = await requireSession();
  const [menuItems, discountEligible, recentOrders] = await Promise.all([
    listMenu(user.orgId),
    resolveDiscountEligibility(user),
    listRecentOrdersByUser(user.orgId, user.id, 5),
  ]);

  // Server-resolve the ACTUAL discount % the member will be charged (I-044,
  // FR-730/AC-730) — the cart preview must never show a hardcoded rate.
  let discountPct = 0;
  if (discountEligible) {
    const [profile] = await findProfilesByIds(user.orgId, [user.id]);
    if (profile) {
      discountPct = (await getTierDiscounts(user.orgId, profile.membershipTier)).cafeDiscountPct;
    }
  }

  const menu: MenuItemView[] = menuItems.map((m) => ({
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    category: mapCategory(m.category),
    priceRupiah: m.priceRupiah,
    description: m.description,
    hasVariants: m.hasVariants,
    variantConfig: m.variantConfig,
  }));

  const mostRecent = recentOrders[0];
  const recentOrder: RecentOrderView | null = mostRecent
    ? {
        code: `#${mostRecent.code}`,
        placedAt: mostRecent.createdAt.toISOString(),
        totalRupiah: mostRecent.totalRupiah,
        status: mostRecent.status,
        items: mostRecent.items.map((item) => ({
          nameSnapshot: item.nameSnapshot,
          qty: item.qty,
          variant: formatVariantOptions(item.variantOptions),
        })),
      }
    : null;

  return (
    <CafeClient
      menu={menu}
      recentOrder={recentOrder}
      discountPct={discountPct}
    />
  );
}
