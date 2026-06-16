/**
 * Guest cafe page — server component.
 * Fetches menu from DB using the single venue org (resolved server-side by slug).
 * No session required; no discount applied.
 * FR-102, FR-113 / AC-101
 *
 * force-dynamic: no cookies/session here, so Next.js would otherwise statically
 * optimize this at build time, freezing the menu. We need a fresh DB read per
 * request so live menu changes (availability, new items) are reflected immediately.
 */
export const dynamic = "force-dynamic";

import { db } from "@/lib/db/drizzle";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listMenu } from "@/lib/db/cafe";
import { GuestCafeClient } from "./GuestCafeClient";
import type { GuestMenuItemView } from "./GuestCafeClient";

async function resolveOrgId(): Promise<string> {
  const slug = process.env.SEED_ORG_SLUG ?? "flowspace";
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) throw new Error(`ORG_NOT_FOUND: ${slug}`);
  return org.id;
}

export default async function GuestCafePage() {
  const orgId = await resolveOrgId();
  const menuItems = await listMenu(orgId);

  const menu: GuestMenuItemView[] = menuItems.map((m) => ({
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    category: m.category, // DB enum: COFFEE / NON_COFFEE / FOOD / SNACK
    priceRupiah: m.priceRupiah,
    description: m.description,
    hasVariants: m.hasVariants,
  }));

  return <GuestCafeClient menu={menu} />;
}
