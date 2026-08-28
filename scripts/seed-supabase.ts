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
import { eq, and, isNull } from "drizzle-orm";
import {
  organizations,
  appUsers,
  cafeMenuItems,
  timeCreditPackages,
  facilities,
  orgPrintPricing,
  printTopupPackages,
  printers,
  timeCreditLots,
} from "@/lib/db/schema";
import {
  MEMBERSHIP_TIERS,
  type Role,
  type MembershipTier,
  type CafeCategory,
} from "@/lib/db/enums";
import { PRINT_PRICE_MATRIX, PRINT_MATRIX_CELLS } from "@/lib/print/pricing";
import { LOCKED_TIER_DISCOUNTS } from "@/lib/tier-discounts";
import { updateTierDiscounts } from "@/lib/db/tier-config";
import { FACILITY_CATALOG, PACKAGE_CATALOG } from "@/lib/booking/catalog";
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
// Cafe menu (I-022, FR-103; variants I-044, FR-729). Seeded into the org so
// all three menu surfaces render against real rows. Deterministic id
// (`<orgId>__<slug>`) → idempotent upsert.
//
// Menu = snacks + beverages + Paket A/B/C (the à-la-carte "ramesan" rice mains
// are intentionally NOT seeded yet). Paket combos map to the FOOD category (no
// dedicated PAKET category exists). Prices are the customer-facing menu-board
// values (ESB stores ex-VAT; board ≈ ex-VAT ×1.10 rounded).
// ponytail: Paket→FOOD instead of a new enum, avoids a migration + UI-tab change.
//
// Variants (I-044): the menu already name-encodes temperature (Es…/…Panas
// pairs) and sweetness for teas (…Manis/…Tawar) as separate same-price items,
// so the seed does NOT add a Temperature group. It idempotently adds a
// required Sugar group (Normal/Less/No Sugar, each +0) to made-to-order
// COFFEE/NON_COFFEE items, excluding bottled coffee, soda, water, and the
// already-unsweetened teas (FR-729). Priced adjustments (e.g. a Cold
// +Rp3.000 pattern) are exercised by unit/integration test fixtures, not
// this seed — every SUGAR_VARIANT_CONFIG option is +0.
// ---------------------------------------------------------------------------
const SUGAR_VARIANT_CONFIG = {
  variants: [
    {
      name: "Sugar",
      required: true,
      options: [
        { name: "Normal Sugar", priceAdjustment: 0 },
        { name: "Less Sugar", priceAdjustment: 0 },
        { name: "No Sugar", priceAdjustment: 0 },
      ],
    },
  ],
} as const;

const SUGAR_VARIANT_SLUGS = new Set([
  "es-kopi-susu-aren", "es-kopi-susu-milo", "butter-scotch-latte",
  "es-kopi-susu", "kopi-susu-panas", "es-kopi-sanger", "kopi-sanger-panas",
  "es-kopi-hitam", "kopi-hitam-panas", "kopi-saring-ijen", "kopi-saring-toraja",
  "kopi-saring-tolu-batak", "kopi-tubruk-ijen", "kopi-tubruk-toraja",
  "kopi-tubruk-tolu-batak", "es-matcha", "matcha-panas", "es-milo",
  "milo-panas", "ice-lychee-tea", "es-teh-manis", "teh-manis-hangat",
]);

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
}> = [
  // -- Paket A/B/C (FOOD) --
  { slug: "paket-a", name: "Paket A", emoji: "🍛", category: "Food", price: 25000, description: "Nasi putih, 1 lauk telur/tahu, 2 sayur, 1 pendamping, sambal." },
  { slug: "paket-b", name: "Paket B", emoji: "🍛", category: "Food", price: 30000, description: "Nasi putih, 1 lauk protein, 1 sayur, 1 pendamping, sambal." },
  { slug: "paket-c", name: "Paket C", emoji: "🍛", category: "Food", price: 35000, description: "Nasi putih, 1 lauk protein, 2 sayur, sambal." },
  // -- Snacks (SNACK) --
  { slug: "banana-bread", name: "Banana Bread", emoji: "🍌", category: "Snack", price: 7500, description: "Roti pisang lembut, panggang harian." },
  { slug: "donat-kentang", name: "Donat Kentang", emoji: "🍩", category: "Snack", price: 7500, description: "Donat kentang empuk bertabur gula." },
  // -- Beverages · Coffee (COFFEE) --
  { slug: "es-kopi-susu-aren", name: "Es Kopi Susu Aren", emoji: "🧋", category: "Coffee", price: 25000, description: "Kopi susu dingin dengan gula aren." },
  { slug: "es-kopi-susu-milo", name: "Es Kopi Susu Milo", emoji: "🧋", category: "Coffee", price: 25000, description: "Kopi susu dingin dengan Milo." },
  { slug: "butter-scotch-latte", name: "Butter Scotch Latte", emoji: "🥤", category: "Coffee", price: 25000, description: "Latte manis dengan butter scotch." },
  { slug: "es-kopi-susu", name: "Es Kopi Susu", emoji: "🧋", category: "Coffee", price: 22000, description: "Kopi susu dingin klasik." },
  { slug: "kopi-susu-panas", name: "Kopi Susu Panas", emoji: "☕", category: "Coffee", price: 22000, description: "Kopi susu panas klasik." },
  { slug: "es-kopi-sanger", name: "Es Kopi Sanger", emoji: "🧋", category: "Coffee", price: 22000, description: "Sanger khas Aceh, disajikan dingin." },
  { slug: "kopi-sanger-panas", name: "Kopi Sanger Panas", emoji: "☕", category: "Coffee", price: 22000, description: "Sanger khas Aceh, disajikan panas." },
  { slug: "es-kopi-hitam", name: "Es Kopi Hitam", emoji: "🧊", category: "Coffee", price: 20000, description: "Kopi hitam dingin tanpa susu." },
  { slug: "kopi-hitam-panas", name: "Kopi Hitam Panas", emoji: "☕", category: "Coffee", price: 20000, description: "Kopi hitam panas tanpa susu." },
  { slug: "kopi-saring-ijen", name: "Kopi Saring Ijen Fullwash", emoji: "☕", category: "Coffee", price: 20000, description: "Kopi saring single-origin Ijen fullwash." },
  { slug: "kopi-saring-toraja", name: "Kopi Saring Toraja", emoji: "☕", category: "Coffee", price: 20000, description: "Kopi saring single-origin Toraja." },
  { slug: "kopi-saring-tolu-batak", name: "Kopi Saring Tolu Batak", emoji: "☕", category: "Coffee", price: 18000, description: "Kopi saring single-origin Tolu Batak." },
  { slug: "kopi-tubruk-ijen", name: "Kopi Tubruk Ijen Fullwash", emoji: "☕", category: "Coffee", price: 18000, description: "Kopi tubruk single-origin Ijen fullwash." },
  { slug: "kopi-tubruk-toraja", name: "Kopi Tubruk Toraja", emoji: "☕", category: "Coffee", price: 18000, description: "Kopi tubruk single-origin Toraja." },
  { slug: "kopi-tubruk-tolu-batak", name: "Kopi Tubruk Tolu Batak", emoji: "☕", category: "Coffee", price: 18000, description: "Kopi tubruk single-origin Tolu Batak." },
  { slug: "kopi-hitam-botol", name: "Kopi Hitam Botol 150ml", emoji: "🍶", category: "Coffee", price: 20000, description: "Kopi hitam kemasan botol 150ml." },
  { slug: "cappuccino-botol", name: "Cappuccino Botol 150ml", emoji: "🍶", category: "Coffee", price: 22000, description: "Cappuccino kemasan botol 150ml." },
  { slug: "kopi-susu-aren-botol", name: "Kopi Susu Aren Botol 150ml", emoji: "🍶", category: "Coffee", price: 25000, description: "Kopi susu aren kemasan botol 150ml." },
  // -- Beverages · Non-Coffee (NON_COFFEE) --
  { slug: "es-matcha", name: "Es Matcha", emoji: "🍵", category: "Non-Coffee", price: 25000, description: "Matcha latte dingin." },
  { slug: "matcha-panas", name: "Matcha Panas", emoji: "🍵", category: "Non-Coffee", price: 25000, description: "Matcha latte panas." },
  { slug: "es-milo", name: "Es Milo", emoji: "🥤", category: "Non-Coffee", price: 25000, description: "Milo dingin creamy." },
  { slug: "milo-panas", name: "Milo Panas", emoji: "☕", category: "Non-Coffee", price: 25000, description: "Milo panas creamy." },
  { slug: "ice-lychee-tea", name: "Ice Lychee Tea", emoji: "🧋", category: "Non-Coffee", price: 20000, description: "Teh leci dingin menyegarkan." },
  { slug: "soda-gembira", name: "Soda Gembira", emoji: "🥤", category: "Non-Coffee", price: 20000, description: "Soda susu sirup merah klasik." },
  { slug: "es-teh-manis", name: "Es Teh Manis", emoji: "🧊", category: "Non-Coffee", price: 12000, description: "Teh manis dingin." },
  { slug: "teh-manis-hangat", name: "Teh Manis Hangat", emoji: "🍵", category: "Non-Coffee", price: 12000, description: "Teh manis hangat." },
  { slug: "es-teh-tawar", name: "Es Teh Tawar", emoji: "🧊", category: "Non-Coffee", price: 10000, description: "Teh tawar dingin." },
  { slug: "teh-tawar-hangat", name: "Teh Tawar Hangat", emoji: "🍵", category: "Non-Coffee", price: 10000, description: "Teh tawar hangat." },
  { slug: "aqua-330ml", name: "Aqua 330ml", emoji: "💧", category: "Non-Coffee", price: 5000, description: "Air mineral botol 330ml." },
];

// ---------------------------------------------------------------------------
// Time-credit packages (I-020, OBS-826) + facilities (I-021/I-040, OBS-800..803)
// — the canonical 23-facility / 4-package catalog, lib/booking/catalog.ts is
// the single source of truth (also consumed by the booking-seed migration
// and lib/db/facilities-seed.int.test.ts).
// ---------------------------------------------------------------------------
const PACKAGES = PACKAGE_CATALOG;
const FACILITIES = FACILITY_CATALOG;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sql = postgres(DATABASE_URL, { prepare: false });
  const db = drizzle(sql, {
    schema: { organizations, appUsers, cafeMenuItems, timeCreditPackages, facilities, printTopupPackages, printers },
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

  // -- Cafe menu (FR-103, variants FR-729) — idempotent upsert, deterministic id --
  for (const m of CAFE_MENU) {
    const id = `${org.id}__${m.slug}`;
    const hasVariants = SUGAR_VARIANT_SLUGS.has(m.slug);
    const values = {
      id,
      orgId: org.id,
      name: m.name,
      emoji: m.emoji,
      category: CATEGORY_MAP[m.category],
      priceRupiah: m.price,
      description: m.description,
      hasVariants,
      variantConfig: hasVariants ? SUGAR_VARIANT_CONFIG : null,
    };
    await db
      .insert(cafeMenuItems)
      .values(values)
      .onConflictDoUpdate({
        target: cafeMenuItems.id,
        set: {
          name: values.name,
          emoji: values.emoji,
          category: values.category,
          priceRupiah: values.priceRupiah,
          description: values.description,
          hasVariants: values.hasVariants,
          variantConfig: values.variantConfig,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Seeded ${CAFE_MENU.length} cafe menu items into "${org.slug}".`);

  // -- Time-credit packages (I-020, OBS-826) — idempotent -------------------
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
        priceRupiah: p.priceRupiah,
        pricePerHourRupiah: p.pricePerHourRupiah,
        popular: p.popular,
        sortOrder: p.sortOrder,
      });
    }
  }
  console.log(`Seeded ${PACKAGES.length} time-credit packages.`);

  // -- Facilities (I-021/I-040, OBS-800..803) — idempotent -------------------
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
        ratePerHourRupiah: f.ratePerHourRupiah,
        capacity: f.capacity,
        seatLabel: f.seatLabel,
        zone: f.zone,
        maxHoursCap: f.maxHoursCap,
      });
    }
  }
  console.log(`Seeded ${FACILITIES.length} facilities.`);

  // -- Transitional time-credit lots (I-040, spec 0007 migration-delta 4) ---
  // A member seeded with a legacy `app_users.time_credits` aggregate but no
  // `time_credit_lots` rows gets exactly one transitional lot so the FIFO
  // spend path (Phase 3) has something real to debit against. Idempotent:
  // skipped if the user already has any lot. Deterministic id.
  for (const u of SEED_USERS) {
    if (u.credits <= 0) continue;
    const [appUser] = await db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(eq(appUsers.email, u.email))
      .limit(1);
    if (!appUser) continue;

    const [existingLot] = await db
      .select({ id: timeCreditLots.id })
      .from(timeCreditLots)
      .where(and(eq(timeCreditLots.userId, appUser.id), isNull(timeCreditLots.packageId)))
      .limit(1);
    if (existingLot) continue;

    const id = `${appUser.id}__transitional-lot`;
    const now = new Date();
    await db.insert(timeCreditLots).values({
      id,
      orgId: org.id,
      userId: appUser.id,
      packageId: null,
      purchaseTransactionId: null,
      totalHours: u.credits,
      remainingHours: u.credits,
      purchasedAt: now,
      expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
    });
    console.log(`  Seeded transitional lot for ${u.email} (${u.credits}h, expires +90d)`);
  }

  // -- Pricing config (I-041, spec 0008) — 4-dim locked map, idempotent upsert ----
  // Surprising but intentional: re-running the seed RESETS every org's tier
  // config back to the locked map, including any values an admin has since
  // edited via /admin/settings/tiers. The seed is a dev-reset tool, not a
  // one-time bootstrap — don't run it against a DB you want to keep admin
  // edits on.
  for (const tier of MEMBERSHIP_TIERS) {
    await updateTierDiscounts(org.id, tier, LOCKED_TIER_DISCOUNTS[tier], db);
  }
  // -- Print pricing matrix (I-043) — six deterministic cells, idempotent -------
  for (const cell of PRINT_MATRIX_CELLS) {
    const id = `${org.id}__print-${cell.colorMode.toLowerCase()}-${cell.paperSize}`;
    await db
      .insert(orgPrintPricing)
      .values({
        id,
        orgId: org.id,
        colorMode: cell.colorMode,
        paperSize: cell.paperSize,
        pricePerPageRupiah: PRINT_PRICE_MATRIX[cell.colorMode][cell.paperSize],
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [orgPrintPricing.orgId, orgPrintPricing.colorMode, orgPrintPricing.paperSize],
        set: {
          pricePerPageRupiah: PRINT_PRICE_MATRIX[cell.colorMode][cell.paperSize],
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Seeded print pricing matrix (${PRINT_MATRIX_CELLS.length} cells).`);

  // Print balance packages (I-043) — deterministic ids and stored prices.
  for (const pkg of [
    { pages: 10, priceRupiah: 10000, sortOrder: 1 },
    { pages: 50, priceRupiah: 45000, sortOrder: 2 },
    { pages: 100, priceRupiah: 80000, sortOrder: 3 },
  ]) {
    await db.insert(printTopupPackages).values({
      id: `${org.id}__print-topup-${pkg.pages}`,
      orgId: org.id,
      pages: pkg.pages,
      priceRupiah: pkg.priceRupiah,
      sortOrder: pkg.sortOrder,
      isActive: true,
    }).onConflictDoUpdate({
      target: printTopupPackages.id,
      set: { priceRupiah: pkg.priceRupiah, sortOrder: pkg.sortOrder, isActive: true, archivedAt: null, updatedAt: new Date() },
    });
  }
  console.log("Seeded print topup packages (3 rows).");

  await db.insert(printers).values({
    id: `${org.id}__print-default`, orgId: org.id, name: "flowspace-default-printer",
    displayName: "Printer Utama", location: "Ruang Utama", printerType: "LASER",
    colorSupport: true, paperSizes: ["A4", "A3", "F4"], isActive: true, isDefault: true,
  }).onConflictDoUpdate({
    target: printers.id,
    set: { isActive: true, isDefault: true, archivedAt: null, updatedAt: new Date() },
  });
  console.log("Seeded default print printer.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
