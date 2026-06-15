import { PrismaClient, Role, MembershipTier } from "@prisma/client";
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
}

main().finally(() => prisma.$disconnect());
