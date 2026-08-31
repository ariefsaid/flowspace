"use server";
/**
 * Admin menu-settings actions (I-042). [SEC] money-adjacent — priceRupiah
 * feeds cafe orders. Every action is ADMIN-only, re-checked in-action
 * (session role elsewhere is UX-only); orgId always comes from the session,
 * never the client. The repos validate a non-negative integer price and
 * reject with INVALID_PRICE (no write) — that rejection is forwarded
 * untouched so the client can surface it inline. variantConfig/hasVariants
 * (I-044) are out of scope — this editor never touches them.
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import {
  createMenuItem,
  updateMenuItem,
  toggleAvailable,
  archiveMenuItem,
  type MenuItemInput,
  type MenuItemUpdateInput,
} from "@/lib/db/menu-admin";

async function requireAdmin() {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function createMenuItemAction(input: MenuItemInput) {
  const user = await requireAdmin();
  const created = await createMenuItem(user.orgId, input);
  revalidatePath("/admin/settings/menu");
  return created;
}

export async function updateMenuItemAction(id: string, input: MenuItemUpdateInput) {
  const user = await requireAdmin();
  await updateMenuItem(user.orgId, id, input);
  revalidatePath("/admin/settings/menu");
}

export async function toggleAvailableAction(id: string, available: boolean) {
  const user = await requireAdmin();
  await toggleAvailable(user.orgId, id, available);
  revalidatePath("/admin/settings/menu");
}

export async function archiveMenuItemAction(id: string) {
  const user = await requireAdmin();
  await archiveMenuItem(user.orgId, id);
  revalidatePath("/admin/settings/menu");
}
