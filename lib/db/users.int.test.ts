/**
 * Integration tests for lib/db/users.ts
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 * AC-021: org_id scoping (cross-org isolation)
 * AC-023: no plaintext password — no password column at all (ADR-0014 §1)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { appUsers, organizations, timeCreditLots } from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

/** Dedicated Drizzle + postgres-js client for test DB — never uses the app's singleton. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

// --- test data ---
let orgAId: string;
let orgBId: string;
let aUserId: string;
let bUserId: string;

beforeAll(async () => {
  // Truncate via raw sql (postgres-js) to avoid Drizzle execute hang on
  // Supabase Postgres in the vitest worker environment.
  await testSql`TRUNCATE TABLE "app_users","organizations" RESTART IDENTITY CASCADE`;

  // Seed two orgs
  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Org A", slug: "org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Org B", slug: "org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Seed one user per org (no password column — auth is Supabase Auth, ADR-0014)
  const [userA] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgAId,
      email: "a@x.test",
      name: "Alice",
      role: "MEMBER",
    })
    .returning();
  const [userB] = await testDb
    .insert(appUsers)
    .values({
      orgId: orgBId,
      email: "b@x.test",
      name: "Bob",
      role: "MEMBER",
    })
    .returning();
  aUserId = userA.id;
  bUserId = userB.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// ---------------------------------------------------------------------------
// Import the repository functions under test
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import {
  findByEmail,
  findById,
  findByAuthUserId,
  listByOrg,
  createMember,
  findMemberByEmail,
  updateUser,
  archiveUser,
  adjustCredits,
} from "@/lib/db/users";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:34321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

    it("[SEC] a mixed-case lookup finds a lowercase-stored row (case-insensitive by normalization)", async () => {
      const user = await findByEmail("A@X.Test");
      expect(user).not.toBeNull();
      expect(user?.id).toBe(aUserId);
    });
  });

  describe("[SEC] email casing — normalized consistently at write AND at all lookups", () => {
    it("createMember lowercases a mixed-case email at write, so login (findByEmail) and POS (findMemberByEmail) both resolve it", async () => {
      const mixedEmail = `Mixed.Case-${Date.now()}@X.Test`;
      const { data, error } = await admin.auth.admin.createUser({
        email: mixedEmail.toLowerCase(),
        password: "secret123",
        email_confirm: true,
      });
      expect(error).toBeNull();
      const authUserId = data.user!.id;

      const created = await createMember({
        orgId: orgAId,
        authUserId,
        email: mixedEmail,
        name: "Mixed Case Member",
      });
      // Stored lowercase, not the raw mixed-case input.
      expect(created.email).toBe(mixedEmail.toLowerCase());

      // A login lookup (findByEmail) with the ORIGINAL mixed-case input still
      // resolves the same row — this is the login path that previously broke
      // for a mixed-case stored row.
      const viaLogin = await findByEmail(mixedEmail);
      expect(viaLogin?.id).toBe(created.id);

      // A POS lookup (findMemberByEmail) with the original mixed-case input
      // also resolves the same row.
      const viaPos = await findMemberByEmail(orgAId, mixedEmail);
      expect(viaPos?.id).toBe(created.id);

      await admin.auth.admin.deleteUser(authUserId);
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

  describe("AC-023: no plaintext (and no application password column at all)", () => {
    it("AC-023: app_users has no password/password_hash column; createMember stores none", async () => {
      const cols = await testSql`
        select column_name from information_schema.columns
        where table_name = 'app_users'`;
      const names = cols.map((r) => r.column_name);
      expect(names).not.toContain("password");
      expect(names).not.toContain("password_hash");

      // M-3: the app_users.auth_user_id → auth.users(id) FK is live, so createMember
      // must reference a REAL auth.users row (not a random uuid) — seed one first.
      // Unique email so a leftover auth user from a prior run can't collide.
      const email = `newmember-${Date.now()}@x.test`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: "secret123",
        email_confirm: true,
      });
      expect(error).toBeNull();
      const authUserId = data.user!.id;

      const user = await createMember({
        orgId: orgAId,
        authUserId,
        email,
        name: "New Member",
      });
      expect((user as Record<string, unknown>).password).toBeUndefined();
      expect((user as Record<string, unknown>).passwordHash).toBeUndefined();

      // Clean up the auth user so the local stack stays reusable.
      await admin.auth.admin.deleteUser(authUserId);
    });
  });

  // ---------------------------------------------------------------------------
  // updateUser (I-047) — admin edits name/role/membershipTier, org-scoped
  // ---------------------------------------------------------------------------
  describe("updateUser", () => {
    it("[AC-047-U1] updates name/role/membershipTier within the caller's org", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `update-${Date.now()}@x.test`, name: "Before", role: "MEMBER", membershipTier: "REGULAR" })
        .returning();
      const updated = await updateUser(orgAId, target.id, { name: "After", role: "BARISTA", membershipTier: "GOLD" });
      expect(updated.name).toBe("After");
      expect(updated.role).toBe("BARISTA");
      expect(updated.membershipTier).toBe("GOLD");
    });

    it("[AC-047-U2] a partial update only touches the given fields", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `partial-${Date.now()}@x.test`, name: "Keep Name", role: "MEMBER", membershipTier: "PREMIUM" })
        .returning();
      const updated = await updateUser(orgAId, target.id, { membershipTier: "GOLD" });
      expect(updated.name).toBe("Keep Name");
      expect(updated.role).toBe("MEMBER");
      expect(updated.membershipTier).toBe("GOLD");
    });

    it("[SEC][AC-047-U3] a cross-org id resolves to NOT_FOUND — no write", async () => {
      await expect(updateUser(orgAId, bUserId, { name: "Hijack" })).rejects.toThrow(/NOT_FOUND/);
      const [fresh] = await testDb.select().from(appUsers).where(eq(appUsers.id, bUserId));
      expect(fresh.name).toBe("Bob");
    });

    it("[SEC] rejects an invalid role/tier value — never silently coerced", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `invalidrole-${Date.now()}@x.test`, name: "X", role: "MEMBER" })
        .returning();
      await expect(updateUser(orgAId, target.id, { role: "SUPERADMIN" as never })).rejects.toThrow(/INVALID_ROLE/);
      await expect(updateUser(orgAId, target.id, { membershipTier: "PLATINUM" as never })).rejects.toThrow(/INVALID_TIER/);
    });

    it("rejects a blank name", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `blankname-${Date.now()}@x.test`, name: "X", role: "MEMBER" })
        .returning();
      await expect(updateUser(orgAId, target.id, { name: "   " })).rejects.toThrow(/INVALID_NAME/);
    });
  });

  // ---------------------------------------------------------------------------
  // archiveUser (I-047) — soft-archive, org-scoped, ADMIN refused
  // ---------------------------------------------------------------------------
  describe("archiveUser", () => {
    it("[AC-047-U4] soft-archives a MEMBER — archivedAt set, excluded from findById/listByOrg", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `archive-${Date.now()}@x.test`, name: "ToArchive", role: "MEMBER" })
        .returning();
      const archived = await archiveUser(orgAId, target.id);
      expect(archived.archivedAt).not.toBeNull();
      expect(await findById(orgAId, target.id)).toBeNull();
      const list = await listByOrg(orgAId);
      expect(list.some((u) => u.id === target.id)).toBe(false);
    });

    it("[SEC][AC-047-U5] refuses to archive an ADMIN-role user (never hard-delete either)", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `adminuser-${Date.now()}@x.test`, name: "AdminUser", role: "ADMIN" })
        .returning();
      await expect(archiveUser(orgAId, target.id)).rejects.toThrow(/CANNOT_ARCHIVE_ADMIN/);
      const [fresh] = await testDb.select().from(appUsers).where(eq(appUsers.id, target.id));
      expect(fresh.archivedAt).toBeNull();
    });

    it("[SEC] a cross-org id resolves to NOT_FOUND — no write", async () => {
      await expect(archiveUser(orgAId, bUserId)).rejects.toThrow(/NOT_FOUND/);
      const [fresh] = await testDb.select().from(appUsers).where(eq(appUsers.id, bUserId));
      expect(fresh.archivedAt).toBeNull();
    });

    it("[AC-047-U6][SEC] an archived user's session resolution (findByAuthUserId) returns null — archiving actually revokes access, not just hides them from the directory", async () => {
      const email = `archived-auth-${Date.now()}@x.test`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: "secret123",
        email_confirm: true,
      });
      expect(error).toBeNull();
      const authUserId = data.user!.id;
      const created = await createMember({ orgId: orgAId, authUserId, email, name: "Archived Session" });
      expect(await findByAuthUserId(authUserId)).not.toBeNull();

      await archiveUser(orgAId, created.id);
      expect(await findByAuthUserId(authUserId)).toBeNull();

      await admin.auth.admin.deleteUser(authUserId);
    });
  });

  // ---------------------------------------------------------------------------
  // adjustCredits (I-047) [MONEY] — atomic, clamped ≥0, org-scoped
  // ---------------------------------------------------------------------------
  describe("adjustCredits", () => {
    it("[AC-047-U7] increments printBalance by a positive delta", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `creditprint-${Date.now()}@x.test`, name: "PrintUser", role: "MEMBER", printBalance: 5 })
        .returning();
      const result = await adjustCredits(orgAId, target.id, { printBalanceDelta: 10 });
      expect(result.printBalance).toBe(15);
    });

    it("[MONEY] a printBalance debit clamps at 0, never negative", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `creditclamp-${Date.now()}@x.test`, name: "ClampUser", role: "MEMBER", printBalance: 3 })
        .returning();
      const result = await adjustCredits(orgAId, target.id, { printBalanceDelta: -100 });
      expect(result.printBalance).toBe(0);
    });

    it("[AC-047-U9][MONEY] a positive timeCreditsDelta grants a new lot (never writes app_users.timeCredits directly — it's a derived cache) and recomputes the cache", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `credittimegrant-${Date.now()}@x.test`, name: "GrantUser", role: "MEMBER", timeCredits: 0 })
        .returning();
      const result = await adjustCredits(orgAId, target.id, { timeCreditsDelta: 5 });
      expect(result.timeCredits).toBe(5);
      const lots = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.userId, target.id));
      expect(lots).toHaveLength(1);
      expect(lots[0].remainingHours).toBe(5);
      expect(lots[0].totalHours).toBe(5);
    });

    it("[AC-047-U10][MONEY] a negative timeCreditsDelta debits existing lots FIFO and clamps at 0 (never throws INSUFFICIENT_CREDITS)", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `credittimedebit-${Date.now()}@x.test`, name: "DebitUser", role: "MEMBER" })
        .returning();
      await testDb.insert(timeCreditLots).values({
        orgId: orgAId,
        userId: target.id,
        totalHours: 3,
        remainingHours: 3,
        expiresAt: new Date(Date.now() + 30 * 24 * 3_600_000),
      });

      const result = await adjustCredits(orgAId, target.id, { timeCreditsDelta: -100 });
      expect(result.timeCredits).toBe(0);
      const [lot] = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.userId, target.id));
      expect(lot.remainingHours).toBe(0);
    });

    it("[SEC] a cross-org id resolves to NOT_FOUND — no write", async () => {
      await expect(adjustCredits(orgAId, bUserId, { printBalanceDelta: 10 })).rejects.toThrow(/NOT_FOUND/);
    });

    it("rejects a non-integer delta", async () => {
      const [target] = await testDb
        .insert(appUsers)
        .values({ orgId: orgAId, email: `creditinvalid-${Date.now()}@x.test`, name: "InvalidUser", role: "MEMBER" })
        .returning();
      await expect(adjustCredits(orgAId, target.id, { printBalanceDelta: 1.5 })).rejects.toThrow(/INVALID_DELTA/);
    });
  });
});
