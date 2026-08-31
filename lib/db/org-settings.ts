/**
 * Repository: org_settings (I-042, admin-settings foundation).
 *
 * Org-scoped jsonb config store for the non-CRUD admin settings categories
 * (site/SEO/theme, Google Analytics, email, UniFi). Every function takes a
 * server-derived `orgId` (never client-supplied, ADR-0004). The table is
 * SELECT-only to `authenticated` (I-046 / ADR-0015 addendum convention) — all
 * writes go through the server's service-role connection.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { orgSettings } from "@/lib/db/schema";

export const ORG_SETTINGS_CATEGORIES = ["site", "analytics", "email", "unifi"] as const;
export type OrgSettingsCategory = (typeof ORG_SETTINGS_CATEGORIES)[number];

export type OrgSettingsValues = Record<string, unknown>;

/** The stored jsonb blob for (org, category), or {} when no row exists yet. */
export async function getOrgSettings(
  orgId: string,
  category: OrgSettingsCategory,
): Promise<OrgSettingsValues> {
  const [row] = await db
    .select({ settings: orgSettings.settings })
    .from(orgSettings)
    .where(and(eq(orgSettings.orgId, orgId), eq(orgSettings.category, category)))
    .limit(1);
  return row?.settings ?? {};
}

export type Txdb = Pick<typeof db, "insert">;

/**
 * Upsert the jsonb blob for (org, category) — ADMIN-only, the caller enforces
 * role. Rejects an unknown category (no write); the unique (org, category)
 * key makes the write idempotent.
 */
export async function setOrgSettings(
  orgId: string,
  category: OrgSettingsCategory,
  values: OrgSettingsValues,
  txdb: Txdb = db,
): Promise<void> {
  if (!ORG_SETTINGS_CATEGORIES.includes(category)) {
    throw new Error("INVALID_CATEGORY");
  }
  await txdb
    .insert(orgSettings)
    .values({ orgId, category, settings: values })
    .onConflictDoUpdate({
      target: [orgSettings.orgId, orgSettings.category],
      set: { settings: values, updatedAt: new Date() },
    });
}
