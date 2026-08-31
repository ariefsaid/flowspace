/**
 * Repository: cafe_menu_items (admin CRUD, I-042). [SEC] money-adjacent — the
 * cafe order flow reads `priceRupiah` from this table. Every function takes a
 * server-derived `orgId` (never client-supplied, ADR-0004); the caller (the
 * settings page's server action) enforces ADMIN role. Writes validate a
 * non-negative integer price; archive is soft (`archivedAt`) — never a hard
 * delete. `variantConfig`/`hasVariants` (I-044) are left alone — this
 * foundation repo doesn't touch the variant editor.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { cafeMenuItems, type CafeMenuItem } from "@/lib/db/schema";
import type { CafeCategory } from "@/lib/db/enums";

export type MenuItemInput = {
  name: string;
  emoji: string;
  category: CafeCategory;
  priceRupiah: number;
  description?: string;
  available?: boolean;
};

export type MenuItemUpdateInput = Partial<MenuItemInput>;

function assertValidPrice(priceRupiah: number): void {
  if (!Number.isInteger(priceRupiah) || priceRupiah < 0) {
    throw new Error("INVALID_PRICE");
  }
}

/** All non-archived menu items for the org, ordered by category then name (admin editor). */
export function listMenuForAdmin(orgId: string): Promise<CafeMenuItem[]> {
  return db
    .select()
    .from(cafeMenuItems)
    .where(and(eq(cafeMenuItems.orgId, orgId), isNull(cafeMenuItems.archivedAt)))
    .orderBy(asc(cafeMenuItems.category), asc(cafeMenuItems.name));
}

/** Insert one menu item for the org (ADMIN-only — caller enforces role). */
export async function createMenuItem(orgId: string, input: MenuItemInput): Promise<CafeMenuItem> {
  assertValidPrice(input.priceRupiah);
  const [row] = await db
    .insert(cafeMenuItems)
    .values({
      orgId,
      name: input.name,
      emoji: input.emoji,
      category: input.category,
      priceRupiah: input.priceRupiah,
      description: input.description ?? "",
      available: input.available ?? true,
    })
    .returning();
  return row;
}

/** Patch a menu item's fields in place (ADMIN-only — caller enforces role). */
export async function updateMenuItem(
  orgId: string,
  id: string,
  input: MenuItemUpdateInput,
): Promise<void> {
  if (input.priceRupiah !== undefined) assertValidPrice(input.priceRupiah);
  await db
    .update(cafeMenuItems)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(cafeMenuItems.orgId, orgId), eq(cafeMenuItems.id, id)));
}

/** Flip a menu item's `available` flag (ADMIN-only — caller enforces role). */
export async function toggleAvailable(orgId: string, id: string, available: boolean): Promise<void> {
  await db
    .update(cafeMenuItems)
    .set({ available, updatedAt: new Date() })
    .where(and(eq(cafeMenuItems.orgId, orgId), eq(cafeMenuItems.id, id)));
}

/** Soft-archive a menu item — never a hard delete (order history keeps its FK). */
export async function archiveMenuItem(orgId: string, id: string): Promise<void> {
  await db
    .update(cafeMenuItems)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(cafeMenuItems.orgId, orgId), eq(cafeMenuItems.id, id)));
}
