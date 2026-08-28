/**
 * Member cafe page — server component.
 * Fetches menu from DB (org-scoped) and discount eligibility server-side.
 * Passes data as props to the CafeClient (client leaf).
 * FR-102 / AC-101
 */
import { requireSession } from "@/lib/auth/session";
import { resolveDiscountEligibility } from "@/lib/cafe/eligibility";
import { listMenu } from "@/lib/db/cafe";
import { findProfilesByIds } from "@/lib/db/users";
import { getTierDiscounts } from "@/lib/db/tier-config";
import { CafeClient } from "./CafeClient";
import type { MenuItemView } from "./CafeClient";
import type { CafeCategory } from "@/lib/db/enums";

/** Map Prisma CafeCategory enum → the string our CafeClient understands. */
function mapCategory(cat: CafeCategory): string {
  return cat; // DB enum values are already COFFEE / NON_COFFEE / FOOD / SNACK
}

export default async function CafePage() {
  const user = await requireSession();
  const [menuItems, discountEligible] = await Promise.all([
    listMenu(user.orgId),
    resolveDiscountEligibility(user),
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

  return (
    <CafeClient
      menu={menu}
      recentOrder={null}
      discountPct={discountPct}
    />
  );
}
