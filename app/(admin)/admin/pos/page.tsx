/**
 * Admin POS page — server component.
 * Reads live menu (+ variant config) from DB; checkout is wired via
 * app/(admin)/admin/pos/actions.ts (I-044, FR-725/726).
 * FR-102 / AC-101 / AC-719
 */
import { requireSession } from "@/lib/auth/session";
import { listMenu } from "@/lib/db/cafe";
import { PosClient } from "./PosClient";
import type { PosMenuItemView } from "./PosClient";

export default async function AdminPosPage() {
  const user = await requireSession();
  const menuItems = await listMenu(user.orgId);

  const menu: PosMenuItemView[] = menuItems.map((m) => ({
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    category: m.category, // DB enum: COFFEE / NON_COFFEE / FOOD / SNACK
    priceRupiah: m.priceRupiah,
    description: m.description,
    hasVariants: m.hasVariants,
    variantConfig: m.variantConfig,
  }));

  return <PosClient menu={menu} />;
}
