/**
 * Admin cafe menu editor — "Kelola Menu Cafe" (I-042). RSC: loads the org's
 * non-archived menu items, renders the editor. ADMIN-only is enforced by
 * middleware + the (admin) layout guard; the actions re-check ADMIN
 * server-side. variantConfig/hasVariants (I-044) are out of scope here.
 */
import { requireSession } from "@/lib/auth/session";
import { listMenuForAdmin } from "@/lib/db/menu-admin";
import { MenuClient } from "./MenuClient";

export default async function AdminMenuSettingsPage() {
  const { orgId } = await requireSession();
  const items = await listMenuForAdmin(orgId);
  return <MenuClient items={items} />;
}
