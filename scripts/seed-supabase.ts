/**
 * Supabase e2e / dev seed (Phase 5, I-005).
 *
 * Creates the dev org + 3 seed users (admin / member / barista) in BOTH
 * Supabase Auth (via the service-role admin API) and the linked `app_users`
 * table. Idempotent: re-running is safe (skips rows that already exist).
 *
 * Env vars read (with local-stack fallbacks matching `lib/supabase/env.ts`):
 *   NEXT_PUBLIC_SUPABASE_URL      — Supabase API URL (default: http://127.0.0.1:34321)
 *   SUPABASE_SERVICE_ROLE_KEY     — service-role JWT (default: local demo key)
 *   DATABASE_URL                  — Postgres URL for Drizzle inserts (default: local 34322)
 *   SEED_ORG_SLUG                 — org slug (default: "flowspace")
 *   SEED_ADMIN_EMAIL / _PASSWORD
 *   SEED_MEMBER_EMAIL / _PASSWORD
 *   SEED_BARISTA_EMAIL / _PASSWORD
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import {
  organizations,
  appUsers,
  cafeMenuItems,
  timeCreditPackages,
  facilities,
  membershipTierConfig,
  orgPrintPricing,
} from "@/lib/db/schema";
import {
  MEMBERSHIP_TIERS,
  type Role,
  type MembershipTier,
  type CafeCategory,
  type FacilityType,
} from "@/lib/db/enums";
import { PRINT_RATE_BW, PRINT_RATE_COLOR } from "@/lib/print/pricing";
import { LOCKED_TIER_DISCOUNTS } from "@/lib/tier-discounts";
import { createId } from "@paralleldrive/cuid2";

// ---------------------------------------------------------------------------
// Env resolution (same defaults as lib/supabase/env.ts — local Supabase CLI)
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:34321";

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const SEED_ORG_SLUG = process.env.SEED_ORG_SLUG ?? "flowspace";

// ---------------------------------------------------------------------------
// Seed users: these match the e2e spec credentials exactly (AC-002 / AC-010)
// ---------------------------------------------------------------------------
const SEED_USERS: Array<{
  key: string;
  email: string;
  name: string;
  password: string;
  role: Role;
  tier: MembershipTier;
  credits: number;
  print: number;
}> = [
  {
    key: "ADMIN",
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@flowspace.test",
    name: "Admin",
    password: process.env.SEED_ADMIN_PASSWORD ?? "dev-admin-pw",
    role: "ADMIN",
    tier: "REGULAR",
    credits: 0,
    print: 0,
  },
  {
    key: "MEMBER",
    email: process.env.SEED_MEMBER_EMAIL ?? "budi@flowspace.test",
    name: "Budi Santoso",
    password: process.env.SEED_MEMBER_PASSWORD ?? "dev-member-pw",
    role: "MEMBER",
    tier: "PREMIUM",
    credits: 139,
    print: 68,
  },
  {
    key: "BARISTA",
    email: process.env.SEED_BARISTA_EMAIL ?? "barista@flowspace.test",
    name: "Barista",
    password: process.env.SEED_BARISTA_PASSWORD ?? "dev-barista-pw",
    role: "BARISTA",
    tier: "REGULAR",
    credits: 0,
    print: 0,
  },
];

// ---------------------------------------------------------------------------
// Cafe menu (I-022, FR-103). Seeded into the org so all three menu surfaces
// render against real rows. Deterministic id (`<orgId>__<slug>`) → idempotent.
//
// Menu = snacks + beverages + Paket A/B/C (the à-la-carte "ramesan" rice mains
// are intentionally NOT seeded yet). Paket combos map to the FOOD category (no
// dedicated PAKET category exists). Prices are the customer-facing menu-board
// values (ESB stores ex-VAT; board ≈ ex-VAT ×1.10 rounded). hasVariants=false
// throughout — hot/iced are already separate SKUs (Es… / …Panas).
// ponytail: Paket→FOOD instead of a new enum, avoids a migration + UI-tab change.
// ---------------------------------------------------------------------------
const CATEGORY_MAP: Record<string, CafeCategory> = {
  Coffee: "COFFEE",
  "Non-Coffee": "NON_COFFEE",
  Food: "FOOD",
  Snack: "SNACK",
};

const CAFE_MENU: Array<{
  slug: string;
  name: string;
  emoji: string;
  category: string;
  price: number;
  description: string;
  hasVariants: boolean;
}> = [
  // -- Paket A/B/C (FOOD) --
  { slug: "paket-a", name: "Paket A", emoji: "🍛", category: "Food", price: 25000, description: "Nasi putih, 1 lauk telur/tahu, 2 sayur, 1 pendamping, sambal.", hasVariants: false },
  { slug: "paket-b", name: "Paket B", emoji: "🍛", category: "Food", price: 30000, description: "Nasi putih, 1 lauk protein, 1 sayur, 1 pendamping, sambal.", hasVariants: false },
  { slug: "paket-c", name: "Paket C", emoji: "🍛", category: "Food", price: 35000, description: "Nasi putih, 1 lauk protein, 2 sayur, sambal.", hasVariants: false },
  // -- Snacks (SNACK) --
  { slug: "banana-bread", name: "Banana Bread", emoji: "🍌", category: "Snack", price: 7500, description: "Roti pisang lembut, panggang harian.", hasVariants: false },
  { slug: "donat-kentang", name: "Donat Kentang", emoji: "🍩", category: "Snack", price: 7500, description: "Donat kentang empuk bertabur gula.", hasVariants: false },
  // -- Beverages · Coffee (COFFEE) --
  { slug: "es-kopi-susu-aren", name: "Es Kopi Susu Aren", emoji: "🧋", category: "Coffee", price: 25000, description: "Kopi susu dingin dengan gula aren.", hasVariants: false },
  { slug: "es-kopi-susu-milo", name: "Es Kopi Susu Milo", emoji: "🧋", category: "Coffee", price: 25000, description: "Kopi susu dingin dengan Milo.", hasVariants: false },
  { slug: "butter-scotch-latte", name: "Butter Scotch Latte", emoji: "🥤", category: "Coffee", price: 25000, description: "Latte manis dengan butter scotch.", hasVariants: false },
  { slug: "es-kopi-susu", name: "Es Kopi Susu", emoji: "🧋", category: "Coffee", price: 22000, description: "Kopi susu dingin klasik.", hasVariants: false },
  { slug: "kopi-susu-panas", name: "Kopi Susu Panas", emoji: "☕", category: "Coffee", price: 22000, description: "Kopi susu panas klasik.", hasVariants: false },
  { slug: "es-kopi-sanger", name: "Es Kopi Sanger", emoji: "🧋", category: "Coffee", price: 22000, description: "Sanger khas Aceh, disajikan dingin.", hasVariants: false },
  { slug: "kopi-sanger-panas", name: "Kopi Sanger Panas", emoji: "☕", category: "Coffee", price: 22000, description: "Sanger khas Aceh, disajikan panas.", hasVariants: false },
  { slug: "es-kopi-hitam", name: "Es Kopi Hitam", emoji: "🧊", category: "Coffee", price: 20000, description: "Kopi hitam dingin tanpa susu.", hasVariants: false },
  { slug: "kopi-hitam-panas", name: "Kopi Hitam Panas", emoji: "☕", category: "Coffee", price: 20000, description: "Kopi hitam panas tanpa susu.", hasVariants: false },
  { slug: "kopi-saring-ijen", name: "Kopi Saring Ijen Fullwash", emoji: "☕", category: "Coffee", price: 20000, description: "Kopi saring single-origin Ijen fullwash.", hasVariants: false },
  { slug: "kopi-saring-toraja", name: "Kopi Saring Toraja", emoji: "☕", category: "Coffee", price: 20000, description: "Kopi saring single-origin Toraja.", hasVariants: false },
  { slug: "kopi-saring-tolu-batak", name: "Kopi Saring Tolu Batak", emoji: "☕", category: "Coffee", price: 18000, description: "Kopi saring single-origin Tolu Batak.", hasVariants: false },
  { slug: "kopi-tubruk-ijen", name: "Kopi Tubruk Ijen Fullwash", emoji: "☕", category: "Coffee", price: 18000, description: "Kopi tubruk single-origin Ijen fullwash.", hasVariants: false },
  { slug: "kopi-tubruk-toraja", name: "Kopi Tubruk Toraja", emoji: "☕", category: "Coffee", price: 18000, description: "Kopi tubruk single-origin Toraja.", hasVariants: false },
  { slug: "kopi-tubruk-tolu-batak", name: "Kopi Tubruk Tolu Batak", emoji: "☕", category: "Coffee", price: 18000, description: "Kopi tubruk single-origin Tolu Batak.", hasVariants: false },
  { slug: "kopi-hitam-botol", name: "Kopi Hitam Botol 150ml", emoji: "🍶", category: "Coffee", price: 20000, description: "Kopi hitam kemasan botol 150ml.", hasVariants: false },
  { slug: "cappuccino-botol", name: "Cappuccino Botol 150ml", emoji: "🍶", category: "Coffee", price: 22000, description: "Cappuccino kemasan botol 150ml.", hasVariants: false },
  { slug: "kopi-susu-aren-botol", name: "Kopi Susu Aren Botol 150ml", emoji: "🍶", category: "Coffee", price: 25000, description: "Kopi susu aren kemasan botol 150ml.", hasVariants: false },
  // -- Beverages · Non-Coffee (NON_COFFEE) --
  { slug: "es-matcha", name: "Es Matcha", emoji: "🍵", category: "Non-Coffee", price: 25000, description: "Matcha latte dingin.", hasVariants: false },
  { slug: "matcha-panas", name: "Matcha Panas", emoji: "🍵", category: "Non-Coffee", price: 25000, description: "Matcha latte panas.", hasVariants: false },
  { slug: "es-milo", name: "Es Milo", emoji: "🥤", category: "Non-Coffee", price: 25000, description: "Milo dingin creamy.", hasVariants: false },
  { slug: "milo-panas", name: "Milo Panas", emoji: "☕", category: "Non-Coffee", price: 25000, description: "Milo panas creamy.", hasVariants: false },
  { slug: "ice-lychee-tea", name: "Ice Lychee Tea", emoji: "🧋", category: "Non-Coffee", price: 20000, description: "Teh leci dingin menyegarkan.", hasVariants: false },
  { slug: "soda-gembira", name: "Soda Gembira", emoji: "🥤", category: "Non-Coffee", price: 20000, description: "Soda susu sirup merah klasik.", hasVariants: false },
  { slug: "es-teh-manis", name: "Es Teh Manis", emoji: "🧊", category: "Non-Coffee", price: 12000, description: "Teh manis dingin.", hasVariants: false },
  { slug: "teh-manis-hangat", name: "Teh Manis Hangat", emoji: "🍵", category: "Non-Coffee", price: 12000, description: "Teh manis hangat.", hasVariants: false },
  { slug: "es-teh-tawar", name: "Es Teh Tawar", emoji: "🧊", category: "Non-Coffee", price: 10000, description: "Teh tawar dingin.", hasVariants: false },
  { slug: "teh-tawar-hangat", name: "Teh Tawar Hangat", emoji: "🍵", category: "Non-Coffee", price: 10000, description: "Teh tawar hangat.", hasVariants: false },
  { slug: "aqua-330ml", name: "Aqua 330ml", emoji: "💧", category: "Non-Coffee", price: 5000, description: "Air mineral botol 330ml.", hasVariants: false },
];

// ---------------------------------------------------------------------------
// Time-credit packages (I-020) + facilities (I-021) — from recon, masked values.
// ---------------------------------------------------------------------------
const PACKAGES = [
  { slug: "5h", name: "5 Hours", hours: 5, price: 75000, perHour: 15000, popular: false, sort: 1 },
  { slug: "10h", name: "10 Hours", hours: 10, price: 140000, perHour: 14000, popular: true, sort: 2 },
  { slug: "20h", name: "20 Hours", hours: 20, price: 260000, perHour: 13000, popular: false, sort: 3 },
  { slug: "50h", name: "50 Hours", hours: 50, price: 600000, perHour: 12000, popular: false, sort: 4 },
];

const FACILITIES: Array<{ slug: string; name: string; type: FacilityType; rate: number }> = [
  ...["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((l) => ({
    slug: `meja-${l.toLowerCase()}`,
    name: `Meja ${l}`,
    type: "COWORKING_SEAT" as FacilityType,
    rate: 20000,
  })),
  { slug: "meeting-room-a", name: "Meeting Room A", type: "MEETING_ROOM", rate: 120000 },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sql = postgres(DATABASE_URL, { prepare: false });
  const db = drizzle(sql, {
    schema: { organizations, appUsers, cafeMenuItems, timeCreditPackages, facilities },
  });

  // -- Org upsert (by slug) --------------------------------------------------
  const [existing] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, SEED_ORG_SLUG))
    .limit(1);

  const org =
    existing ??
    (await (async () => {
      const [created] = await db
        .insert(organizations)
        .values({ id: createId(), name: "FlowSpace", slug: SEED_ORG_SLUG })
        .returning();
      return created;
    })());

  console.log(`Org "${org.slug}" ready (id: ${org.id})`);

  // -- Users ----------------------------------------------------------------
  for (const u of SEED_USERS) {
    // 1. Upsert Supabase Auth user (admin API, email_confirm: true so no
    //    email-confirmation step is required in dev/test — matches
    //    enable_confirmations = false in supabase/config.toml).
    //
    //    `admin.createUser` fails with "email already exists" if the user is
    //    already present. We detect that, look up the existing auth user, and
    //    continue to the app_users upsert step.
    let authUserId: string;

    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      app_metadata: { role: u.role, org_id: org.id },
    });

    if (error) {
      // Already exists — look up the existing auth user by email
      if (
        error.code === "email_exists" ||
        error.code === "user_already_exists" ||
        /already registered|already exists/i.test(error.message ?? "")
      ) {
        const { data: list } = await admin.auth.admin.listUsers();
        const found = list?.users?.find((au) => au.email === u.email);
        if (!found) throw new Error(`Could not find existing auth user ${u.email}: ${error.message}`);
        authUserId = found.id;
        // Ensure app_metadata is up-to-date (role/org_id may have changed)
        await admin.auth.admin.updateUserById(authUserId, {
          app_metadata: { role: u.role, org_id: org.id },
        });
        console.log(`  Auth user exists — reused ${u.email} (${authUserId})`);
      } else {
        throw new Error(`createUser(${u.email}) failed: ${error.message}`);
      }
    } else {
      authUserId = data.user!.id;
      console.log(`  Created auth user ${u.email} (${authUserId})`);
    }

    // 2. Upsert app_users row linked by auth_user_id / email
    const [existingAppUser] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, u.email))
      .limit(1);

    if (!existingAppUser) {
      await db.insert(appUsers).values({
        id: createId(),
        orgId: org.id,
        authUserId,
        email: u.email,
        name: u.name,
        role: u.role,
        membershipTier: u.tier,
        timeCredits: u.credits,
        printBalance: u.print,
      });
      console.log(`  Inserted app_user ${u.email} (role: ${u.role})`);
    } else {
      // Update auth_user_id link and role in case it drifted
      await db
        .update(appUsers)
        .set({ authUserId, role: u.role, orgId: org.id })
        .where(eq(appUsers.email, u.email));
      console.log(`  app_user ${u.email} already exists — updated auth link`);
    }
  }

  console.log(`\nSeeded org "${SEED_ORG_SLUG}" with ${SEED_USERS.length} users.`);

  // -- Cafe menu (FR-103) — idempotent, deterministic id ---------------------
  for (const m of CAFE_MENU) {
    const id = `${org.id}__${m.slug}`;
    const [existingItem] = await db
      .select()
      .from(cafeMenuItems)
      .where(eq(cafeMenuItems.id, id))
      .limit(1);

    if (!existingItem) {
      await db.insert(cafeMenuItems).values({
        id,
        orgId: org.id,
        name: m.name,
        emoji: m.emoji,
        category: CATEGORY_MAP[m.category],
        priceRupiah: m.price,
        description: m.description,
        hasVariants: m.hasVariants,
      });
    }
  }
  console.log(`Seeded ${CAFE_MENU.length} cafe menu items into "${org.slug}".`);

  // -- Time-credit packages (I-020) — idempotent ----------------------------
  for (const p of PACKAGES) {
    const id = `${org.id}__pkg-${p.slug}`;
    const [existingPkg] = await db
      .select()
      .from(timeCreditPackages)
      .where(eq(timeCreditPackages.id, id))
      .limit(1);
    if (!existingPkg) {
      await db.insert(timeCreditPackages).values({
        id,
        orgId: org.id,
        name: p.name,
        hours: p.hours,
        priceRupiah: p.price,
        pricePerHourRupiah: p.perHour,
        popular: p.popular,
        sortOrder: p.sort,
      });
    }
  }
  console.log(`Seeded ${PACKAGES.length} time-credit packages.`);

  // -- Facilities (I-021) — idempotent --------------------------------------
  for (const f of FACILITIES) {
    const id = `${org.id}__fac-${f.slug}`;
    const [existingFac] = await db
      .select()
      .from(facilities)
      .where(eq(facilities.id, id))
      .limit(1);
    if (!existingFac) {
      await db.insert(facilities).values({
        id,
        orgId: org.id,
        name: f.name,
        type: f.type,
        ratePerHourRupiah: f.rate,
      });
    }
  }
  console.log(`Seeded ${FACILITIES.length} facilities.`);

  // -- Pricing config (I-041, spec 0008) — 4-dim locked map, idempotent upsert ----
  for (const tier of MEMBERSHIP_TIERS) {
    const id = `${org.id}__tiercfg-${tier}`;
    await db
      .insert(membershipTierConfig)
      .values({ id, orgId: org.id, tier, ...LOCKED_TIER_DISCOUNTS[tier] })
      .onConflictDoUpdate({
        target: [membershipTierConfig.orgId, membershipTierConfig.tier],
        set: { ...LOCKED_TIER_DISCOUNTS[tier], updatedAt: new Date() },
      });
  }
  const [existingPrintPricing] = await db
    .select()
    .from(orgPrintPricing)
    .where(eq(orgPrintPricing.orgId, org.id))
    .limit(1);
  if (!existingPrintPricing) {
    await db.insert(orgPrintPricing).values({
      id: `${org.id}__printpricing`,
      orgId: org.id,
      bwRatePerPageRupiah: PRINT_RATE_BW,
      colorRatePerPageRupiah: PRINT_RATE_COLOR,
    });
  }
  console.log(`Seeded pricing config (${MEMBERSHIP_TIERS.length} tiers + print rates).`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
