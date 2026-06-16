import { PrismaClient, Role, MembershipTier, CafeCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const hash = (pw: string) => bcrypt.hashSync(pw, 10);

async function main() {
  const slug = process.env.SEED_ORG_SLUG ?? "flowspace";
  const org = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { name: "FlowSpace", slug },
  });

  const users = [
    {
      key: "ADMIN",
      email: process.env.SEED_ADMIN_EMAIL ?? "admin@flowspace.test",
      name: "Admin",
      role: Role.ADMIN,
      tier: MembershipTier.REGULAR,
      credits: 0,
      print: 0,
      pw: process.env.SEED_ADMIN_PASSWORD ?? "dev-admin-pw",
    },
    {
      key: "MEMBER",
      email: process.env.SEED_MEMBER_EMAIL ?? "budi@flowspace.test",
      name: "Budi Santoso",
      role: Role.MEMBER,
      tier: MembershipTier.PREMIUM,
      credits: 139,
      print: 68,
      pw: process.env.SEED_MEMBER_PASSWORD ?? "dev-member-pw",
    },
    {
      key: "BARISTA",
      email: process.env.SEED_BARISTA_EMAIL ?? "barista@flowspace.test",
      name: "Barista",
      role: Role.BARISTA,
      tier: MembershipTier.REGULAR,
      credits: 0,
      print: 0,
      pw: process.env.SEED_BARISTA_PASSWORD ?? "dev-barista-pw",
    },
  ];

  for (const u of users) {
    await prisma.appUser.upsert({
      where: { email: u.email },
      update: {},
      create: {
        orgId: org.id,
        email: u.email,
        name: u.name,
        passwordHash: hash(u.pw),
        role: u.role,
        membershipTier: u.tier,
        timeCredits: u.credits,
        printBalance: u.print,
      },
    });
  }

  console.log(`Seeded org "${slug}" with ${users.length} users.`);

  // ---------------------------------------------------------------------------
  // Cafe menu seed (I-022 / FR-103) — masked, generic names from lib/mock/cafe.ts
  // ---------------------------------------------------------------------------
  const CATEGORY_MAP: Record<string, CafeCategory> = {
    Coffee: CafeCategory.COFFEE,
    "Non-Coffee": CafeCategory.NON_COFFEE,
    Food: CafeCategory.FOOD,
    Snack: CafeCategory.SNACK,
  };

  const MENU = [
    { id: "americano",     name: "Americano",    emoji: "☕", category: "Coffee",      price: 25000, description: "Espresso dengan air panas, pahit yang bersih.",       hasVariants: true  },
    { id: "latte",         name: "Latte",         emoji: "🥛", category: "Coffee",      price: 32000, description: "Espresso lembut dengan susu steamed.",               hasVariants: true  },
    { id: "cappuccino",    name: "Cappuccino",    emoji: "☕", category: "Coffee",      price: 30000, description: "Espresso dengan foam susu tebal.",                   hasVariants: true  },
    { id: "espresso",      name: "Espresso",      emoji: "☕", category: "Coffee",      price: 20000, description: "Shot espresso pekat, sajian klasik.",                hasVariants: true  },
    { id: "matcha",        name: "Matcha Latte",  emoji: "🍵", category: "Non-Coffee",  price: 35000, description: "Matcha premium dengan susu segar.",                  hasVariants: true  },
    { id: "chocolate",     name: "Chocolate",     emoji: "🍫", category: "Non-Coffee",  price: 28000, description: "Cokelat kental hangat atau dingin.",                 hasVariants: true  },
    { id: "orange-juice",  name: "Orange Juice",  emoji: "🍊", category: "Non-Coffee",  price: 22000, description: "Jus jeruk peras segar tanpa gula tambahan.",         hasVariants: true  },
    { id: "lemon-tea",     name: "Lemon Tea",     emoji: "🍋", category: "Non-Coffee",  price: 20000, description: "Teh dengan perasan lemon segar.",                    hasVariants: true  },
    { id: "tempe-orek",    name: "Tempe Orek",    emoji: "🍱", category: "Food",        price: 4500,  description: "Tempe manis pedas, lauk pendamping.",               hasVariants: false },
    { id: "croissant",     name: "Croissant",     emoji: "🥐", category: "Food",        price: 25000, description: "Croissant butter renyah, baru dipanggang.",          hasVariants: false },
    { id: "sandwich",      name: "Sandwich",      emoji: "🥪", category: "Food",        price: 35000, description: "Roti isi ayam, telur, dan sayuran.",                 hasVariants: false },
    { id: "salad",         name: "Salad",         emoji: "🥗", category: "Food",        price: 45000, description: "Salad sayur segar dengan dressing.",                 hasVariants: false },
    { id: "nasi-rames",    name: "Nasi Rames",    emoji: "🍛", category: "Food",        price: 40000, description: "Nasi dengan aneka lauk lengkap.",                    hasVariants: false },
    { id: "mie-goreng",    name: "Mie Goreng",    emoji: "🍜", category: "Food",        price: 38000, description: "Mie goreng bumbu spesial dengan telur.",             hasVariants: false },
    { id: "tahu-goreng",   name: "Tahu Goreng",   emoji: "🧆", category: "Snack",       price: 25000, description: "Tahu goreng renyah dengan sambal.",                  hasVariants: false },
    { id: "chicken-wings", name: "Chicken Wings", emoji: "🍗", category: "Snack",       price: 35000, description: "Sayap ayam goreng bumbu pedas manis.",               hasVariants: false },
  ];

  for (const m of MENU) {
    const id = `${org.id}__${m.id}`; // deterministic id → idempotent upsert
    await prisma.cafeMenuItem.upsert({
      where: { id },
      update: {},
      create: {
        id,
        orgId: org.id,
        name: m.name,
        emoji: m.emoji,
        category: CATEGORY_MAP[m.category],
        priceRupiah: m.price,
        description: m.description,
        hasVariants: m.hasVariants,
      },
    });
  }

  console.log(`Seeded ${MENU.length} cafe menu items.`);
}

main().finally(() => prisma.$disconnect());
