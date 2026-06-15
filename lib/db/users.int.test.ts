/**
 * Integration tests for lib/db/users.ts
 * Runs against a real (throwaway) Postgres DB via TEST_DATABASE_URL.
 * AC-021: org_id scoping
 * AC-023: no plaintext password
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/flowspace_test?schema=public";

/** Dedicated PrismaClient for the test DB — never uses the app's singleton. */
const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_URL } },
});

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let bUserId: string;

beforeAll(async () => {
  // Truncate all rows (cascade) so tests are idempotent
  await testPrisma.$executeRaw`TRUNCATE TABLE "app_users", "organizations" RESTART IDENTITY CASCADE`;

  // Seed two orgs
  const orgA = await testPrisma.organization.create({
    data: { name: "Org A", slug: "org-a-test" },
  });
  const orgB = await testPrisma.organization.create({
    data: { name: "Org B", slug: "org-b-test" },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Seed one user per org
  const hashA = bcrypt.hashSync("pw-a", 10);
  const hashB = bcrypt.hashSync("pw-b", 10);
  const userA = await testPrisma.appUser.create({
    data: { orgId: orgAId, email: "a@x.test", name: "Alice", passwordHash: hashA, role: "MEMBER" },
  });
  const userB = await testPrisma.appUser.create({
    data: { orgId: orgBId, email: "b@x.test", name: "Bob", passwordHash: hashB, role: "MEMBER" },
  });
  aUserId = userA.id;
  bUserId = userB.id;
});

afterAll(async () => {
  await testPrisma.$executeRaw`TRUNCATE TABLE "app_users", "organizations" RESTART IDENTITY CASCADE`;
  await testPrisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Import the repository functions under test (these don't exist yet — RED)
// ---------------------------------------------------------------------------
import {
  findByEmail,
  findById,
  listByOrg,
  createMember,
} from "@/lib/db/users";

describe("lib/db/users", () => {
  describe("findByEmail", () => {
    it("returns the user when email matches", async () => {
      const user = await findByEmail("a@x.test");
      expect(user).not.toBeNull();
      expect(user?.email).toBe("a@x.test");
    });

    it("returns null for unknown email", async () => {
      const user = await findByEmail("nobody@x.test");
      expect(user).toBeNull();
    });
  });

  describe("AC-021: listByOrg returns only the caller org's users", () => {
    it("AC-021: listByOrg returns only Org A users when called with orgA.id", async () => {
      const users = await listByOrg(orgAId);
      const emails = users.map((u) => u.email);
      expect(emails).toContain("a@x.test");
      expect(emails).not.toContain("b@x.test");
    });

    it("AC-021: listByOrg returns only Org B users when called with orgB.id", async () => {
      const users = await listByOrg(orgBId);
      const emails = users.map((u) => u.email);
      expect(emails).toContain("b@x.test");
      expect(emails).not.toContain("a@x.test");
    });

    it("AC-021: findById(orgA.id, bUser.id) returns null — cross-org id lookup denied", async () => {
      const result = await findById(orgAId, bUserId);
      expect(result).toBeNull();
    });

    it("AC-021: findById(orgA.id, aUser.id) returns the user", async () => {
      const result = await findById(orgAId, aUserId);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(aUserId);
    });
  });

  describe("AC-023: created user stores a bcrypt hash, never plaintext", () => {
    it("AC-023: createMember stores a bcrypt hash and has no plaintext password field", async () => {
      const hash = bcrypt.hashSync("plaintext", 10);
      const user = await createMember({
        orgId: orgAId,
        email: "newmember@x.test",
        name: "New Member",
        passwordHash: hash,
      });

      // Read back the raw row to verify storage
      const stored = await testPrisma.appUser.findUnique({
        where: { email: "newmember@x.test" },
      });

      // passwordHash is a bcrypt hash
      expect(stored?.passwordHash).toMatch(/^\$2/);
      // Not the plaintext string
      expect(stored?.passwordHash).not.toBe("plaintext");
      // The AppUser type has no 'password' field (only 'passwordHash')
      expect((stored as unknown as Record<string, unknown>).password).toBeUndefined();

      // bcrypt.compare verifies the hash
      const ok = await bcrypt.compare("plaintext", stored!.passwordHash);
      expect(ok).toBe(true);

      // The returned AppUser from createMember also has no plaintext
      expect(user.passwordHash).toMatch(/^\$2/);
      expect((user as unknown as Record<string, unknown>).password).toBeUndefined();
    });
  });
});
