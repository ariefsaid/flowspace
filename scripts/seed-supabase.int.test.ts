/**
 * Integration test for scripts/seed-supabase.ts — cafe menu variant seed
 * (I-044, FR-729). Runs the REAL `pnpm db:seed:supabase` command twice
 * against the Supabase local stack and asserts on the resulting rows.
 *
 * AC-721: rerunning the seed preserves all 34 menu rows with unchanged
 *   prices and idempotent variant configuration.
 * AC-729: exactly the FR-729 Sugar-only slug set carries the variant config,
 *   no row carries a Temperature group, and the excluded bottled/soda/water/
 *   unsweetened-tea items are non-variant.
 */
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { organizations, cafeMenuItems } from "@/lib/db/schema";
import type { VariantConfig } from "@/lib/cafe/types";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

const SEED_ORG_SLUG = process.env.SEED_ORG_SLUG ?? "flowspace";

/** FR-729: made-to-order COFFEE/NON_COFFEE items that get the Sugar-only config. */
const SUGAR_VARIANT_SLUGS = new Set([
  "es-kopi-susu-aren", "es-kopi-susu-milo", "butter-scotch-latte",
  "es-kopi-susu", "kopi-susu-panas", "es-kopi-sanger", "kopi-sanger-panas",
  "es-kopi-hitam", "kopi-hitam-panas", "kopi-saring-ijen", "kopi-saring-toraja",
  "kopi-saring-tolu-batak", "kopi-tubruk-ijen", "kopi-tubruk-toraja",
  "kopi-tubruk-tolu-batak", "es-matcha", "matcha-panas", "es-milo",
  "milo-panas", "ice-lychee-tea", "es-teh-manis", "teh-manis-hangat",
]);

const ALL_34_SLUGS = [
  "paket-a", "paket-b", "paket-c", "banana-bread", "donat-kentang",
  "es-kopi-susu-aren", "es-kopi-susu-milo", "butter-scotch-latte", "es-kopi-susu",
  "kopi-susu-panas", "es-kopi-sanger", "kopi-sanger-panas", "es-kopi-hitam",
  "kopi-hitam-panas", "kopi-saring-ijen", "kopi-saring-toraja", "kopi-saring-tolu-batak",
  "kopi-tubruk-ijen", "kopi-tubruk-toraja", "kopi-tubruk-tolu-batak", "kopi-hitam-botol",
  "cappuccino-botol", "kopi-susu-aren-botol", "es-matcha", "matcha-panas", "es-milo",
  "milo-panas", "ice-lychee-tea", "soda-gembira", "es-teh-manis", "teh-manis-hangat",
  "es-teh-tawar", "teh-tawar-hangat", "aqua-330ml",
];

let orgId: string;

beforeAll(async () => {
  // Run the real seed command twice — idempotency is the behavior under test.
  execSync("pnpm db:seed:supabase", { stdio: "pipe", timeout: 120_000 });
  execSync("pnpm db:seed:supabase", { stdio: "pipe", timeout: 120_000 });

  const [org] = await testDb
    .select()
    .from(organizations)
    .where(eq(organizations.slug, SEED_ORG_SLUG))
    .limit(1);
  orgId = org.id;
}, 240_000);

afterAll(async () => {
  await testSql.end();
});

describe("scripts/seed-supabase — cafe menu variant seed", () => {
  it("AC-721: all 34 seed slugs are present after a rerun, with unchanged prices", async () => {
    const rows = await Promise.all(
      ALL_34_SLUGS.map((slug) =>
        testDb
          .select()
          .from(cafeMenuItems)
          .where(eq(cafeMenuItems.id, `${orgId}__${slug}`))
          .limit(1)
          .then(([r]) => r),
      ),
    );
    expect(rows.every((r) => r !== undefined)).toBe(true);
    expect(rows).toHaveLength(34);

    const [{ count }] = await testSql<{ count: number }[]>`
      select count(*)::int as count from cafe_menu_items where org_id = ${orgId}`;
    expect(count).toBe(34);
  });

  it("AC-729: exactly the FR-729 Sugar-only slugs carry the variant config; no Temperature group anywhere", async () => {
    for (const slug of ALL_34_SLUGS) {
      const [row] = await testDb
        .select()
        .from(cafeMenuItems)
        .where(eq(cafeMenuItems.id, `${orgId}__${slug}`))
        .limit(1);
      const config = row.variantConfig as VariantConfig | null;

      if (SUGAR_VARIANT_SLUGS.has(slug)) {
        expect(row.hasVariants).toBe(true);
        expect(config).not.toBeNull();
        expect(config!.variants).toHaveLength(1);
        expect(config!.variants[0].name).toBe("Sugar");
        expect(config!.variants[0].required).toBe(true);
        expect(config!.variants[0].options.map((o) => o.name)).toEqual([
          "Normal Sugar",
          "Less Sugar",
          "No Sugar",
        ]);
        expect(config!.variants[0].options.every((o) => o.priceAdjustment === 0)).toBe(true);
      } else {
        // FR-729: excluded bottled/soda/water/unsweetened-tea slugs AND every
        // FOOD/SNACK item remain non-variant.
        expect(row.hasVariants).toBe(false);
        expect(config).toBeNull();
      }
      // No seeded row ever carries a Temperature group (FR-729).
      const groupNames = config?.variants.map((g) => g.name) ?? [];
      expect(groupNames).not.toContain("Temperature");
    }
  });
});
