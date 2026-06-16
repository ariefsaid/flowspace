/**
 * Supabase e2e / dev seed (Phase 5, I-005).
 *
 * Creates the dev org + 3 seed users (admin / member / barista) in BOTH
 * Supabase Auth (via the service-role admin API) and the linked `app_users`
 * table. Idempotent: re-running is safe (skips rows that already exist).
 *
 * Env vars read (with local-stack fallbacks matching `lib/supabase/env.ts`):
 *   NEXT_PUBLIC_SUPABASE_URL      — Supabase API URL (default: http://127.0.0.1:64321)
 *   SUPABASE_SERVICE_ROLE_KEY     — service-role JWT (default: local demo key)
 *   DATABASE_URL                  — Postgres URL for Drizzle inserts (default: local 64322)
 *   SEED_ORG_SLUG                 — org slug (default: "flowspace")
 *   SEED_ADMIN_EMAIL / _PASSWORD
 *   SEED_MEMBER_EMAIL / _PASSWORD
 *   SEED_BARISTA_EMAIL / _PASSWORD
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { organizations, appUsers, cafeMenuItems } from "@/lib/db/schema";
import type { Role, MembershipTier, CafeCategory } from "@/lib/db/enums";
import { createId } from "@paralleldrive/cuid2";

// ---------------------------------------------------------------------------
// Env resolution (same defaults as lib/supabase/env.ts — local Supabase CLI)
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:64321";

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

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
// Cafe menu (I-022, FR-103). The 16 captured items from lib/mock/cafe.ts, seeded
// into the org so all three menu surfaces render against real rows. Deterministic
// id (`<orgId>__<slug>`) → idempotent (no-op if the row already exists).
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
  { slug: "americano", name: "Americano", emoji: "☕", category: "Coffee", price: 25000, description: "Espresso dengan air panas, pahit yang bersih.", hasVariants: true },
  { slug: "latte", name: "Latte", emoji: "🥛", category: "Coffee", price: 32000, description: "Espresso lembut dengan susu steamed.", hasVariants: true },
  { slug: "cappuccino", name: "Cappuccino", emoji: "☕", category: "Coffee", price: 30000, description: "Espresso dengan foam susu tebal.", hasVariants: true },
  { slug: "espresso", name: "Espresso", emoji: "☕", category: "Coffee", price: 20000, description: "Shot espresso pekat, sajian klasik.", hasVariants: true },
  { slug: "matcha", name: "Matcha Latte", emoji: "🍵", category: "Non-Coffee", price: 35000, description: "Matcha premium dengan susu segar.", hasVariants: true },
  { slug: "chocolate", name: "Chocolate", emoji: "🍫", category: "Non-Coffee", price: 28000, description: "Cokelat kental hangat atau dingin.", hasVariants: true },
  { slug: "orange-juice", name: "Orange Juice", emoji: "🍊", category: "Non-Coffee", price: 22000, description: "Jus jeruk peras segar tanpa gula tambahan.", hasVariants: true },
  { slug: "lemon-tea", name: "Lemon Tea", emoji: "🍋", category: "Non-Coffee", price: 20000, description: "Teh dengan perasan lemon segar.", hasVariants: true },
  { slug: "tempe-orek", name: "Tempe Orek", emoji: "🍱", category: "Food", price: 4500, description: "Tempe manis pedas, lauk pendamping.", hasVariants: false },
  { slug: "croissant", name: "Croissant", emoji: "🥐", category: "Food", price: 25000, description: "Croissant butter renyah, baru dipanggang.", hasVariants: false },
  { slug: "sandwich", name: "Sandwich", emoji: "🥪", category: "Food", price: 35000, description: "Roti isi ayam, telur, dan sayuran.", hasVariants: false },
  { slug: "salad", name: "Salad", emoji: "🥗", category: "Food", price: 45000, description: "Salad sayur segar dengan dressing.", hasVariants: false },
  { slug: "nasi-rames", name: "Nasi Rames", emoji: "🍛", category: "Food", price: 40000, description: "Nasi dengan aneka lauk lengkap.", hasVariants: false },
  { slug: "mie-goreng", name: "Mie Goreng", emoji: "🍜", category: "Food", price: 38000, description: "Mie goreng bumbu spesial dengan telur.", hasVariants: false },
  { slug: "tahu-goreng", name: "Tahu Goreng", emoji: "🧆", category: "Snack", price: 25000, description: "Tahu goreng renyah dengan sambal.", hasVariants: false },
  { slug: "chicken-wings", name: "Chicken Wings", emoji: "🍗", category: "Snack", price: 35000, description: "Sayap ayam goreng bumbu pedas manis.", hasVariants: false },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sql = postgres(DATABASE_URL, { prepare: false });
  const db = drizzle(sql, { schema: { organizations, appUsers, cafeMenuItems } });

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

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
