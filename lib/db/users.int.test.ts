/**
 * Integration tests for lib/db/users.ts
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 * AC-021: org_id scoping (cross-org isolation)
 * AC-023: no plaintext password — no password column at all (ADR-0014 §1)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { appUsers, organizations } from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

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
  listByOrg,
  createMember,
} from "@/lib/db/users";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:64321";
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
});
