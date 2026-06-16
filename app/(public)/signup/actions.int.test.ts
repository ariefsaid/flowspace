/**
 * Integration tests for app/(public)/signup/actions.ts (signupAction) on the
 * Supabase Auth + Drizzle stack (ADR-0014). Runs against the Supabase local
 * stack (Postgres at TEST_DATABASE_URL, Auth at NEXT_PUBLIC_SUPABASE_URL).
 *
 * AC-004: signup mints a real Supabase auth.users row (role/org_id app-metadata
 *         set via the admin API) and inserts a linked MEMBER `app_users` row
 *         carrying its `auth_user_id` — and NO password column (Supabase owns
 *         the credential).
 * AC-005: a duplicate email is rejected and leaves the app_users/user count
 *         unchanged.
 * M-3:    the app_users↔auth.users FK (0001_auth_link) is live, so if the profile
 *         insert fails AFTER admin.createUser succeeds the just-created auth user
 *         is DELETED — no orphan identity is left behind.
 *
 * The Supabase admin client is REAL (so createUser/deleteUser actually touch
 * auth.users and the FK is exercised). Only `@/lib/db/users` is partially mocked
 * so the TOCTOU pre-check can be bypassed and createMember can be forced to throw
 * for the no-orphan proof.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import * as schema from "@/lib/db/schema";
import { appUsers, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:64321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Dedicated postgres-js + Drizzle client for the test DB. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

/** Real admin client against the local Auth service (exercises the FK). */
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_SLUG = "signup-int-org";

// Every auth.users email created during these tests — cleaned up before/after so
// re-runs against the same local stack stay deterministic. race-seed is appended
// in the TOCTOU test (it is created inline).
const TEST_EMAILS = new Set<string>([
  "dewi@example.com",
  "dup-auth@example.com",
  "race@example.com",
  "race-seed@example.com",
  "dup@example.com",
  "orphan@example.com",
]);

// ---------------------------------------------------------------------------
// Partial mock of the users repo: createMember stays REAL (hits the test DB) but
// can be forced to throw for the M-3 no-orphan proof; findByEmail can be forced
// to return null to simulate a TOCTOU race past the pre-check.
// ---------------------------------------------------------------------------
const { forceFindByEmailNull, forceCreateMemberThrow } = vi.hoisted(() => ({
  forceFindByEmailNull: { value: false },
  forceCreateMemberThrow: { value: false },
}));

vi.mock("@/lib/db/users", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/db/users")>();
  return {
    ...actual,
    findByEmail: (email: string) =>
      forceFindByEmailNull.value
        ? Promise.resolve(null)
        : actual.findByEmail(email),
    createMember: (input: Parameters<typeof actual.createMember>[0]) => {
      if (forceCreateMemberThrow.value) {
        throw new Error("forced profile-insert failure");
      }
      return actual.createMember(input);
    },
  };
});

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "app_users", "organizations" RESTART IDENTITY CASCADE`;
  await testDb
    .insert(organizations)
    .values({ name: "Signup Int Org", slug: ORG_SLUG });
  // signupAction resolves the org via SEED_ORG_SLUG against the app singleton,
  // which the int setup points at the test DB.
  process.env.SEED_ORG_SLUG = ORG_SLUG;
}, 30_000);

beforeEach(async () => {
  await testDb.delete(appUsers);
  await deleteTestAuthUsers();
  forceFindByEmailNull.value = false;
  forceCreateMemberThrow.value = false;
});

afterAll(async () => {
  await deleteTestAuthUsers();
  await testSql`TRUNCATE TABLE "app_users", "organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Delete every auth.users row whose email is one of the test fixtures. */
async function deleteTestAuthUsers() {
  const { data } = await admin.auth.admin.listUsers();
  const targets = (data?.users ?? []).filter((u) =>
    TEST_EMAILS.has(u.email ?? ""),
  );
  for (const u of targets) {
    await admin.auth.admin.deleteUser(u.id);
  }
}

/** Count auth.users rows matching an email (0 when none / deleted). */
async function countAuthUsersByEmail(email: string): Promise<number> {
  const { data } = await admin.auth.admin.listUsers();
  return (data?.users ?? []).filter((u) => u.email === email).length;
}

// ---------------------------------------------------------------------------
// Import the action under test AFTER the int setup has overridden DATABASE_URL
// and AFTER the `@/lib/db/users` mock is registered.
// ---------------------------------------------------------------------------
import { signupAction } from "./actions";

describe("signupAction", () => {
  it("AC-004: mints a real auth user (role/org_id app-metadata) + a linked MEMBER row; no password column", async () => {
    const [org] = await testDb
      .select()
      .from(organizations)
      .where(eq(organizations.slug, ORG_SLUG))
      .limit(1);

    const res = await signupAction({
      name: "Dewi Member",
      email: "Dewi@Example.com",
      password: "secret123",
    });

    expect(res).toEqual({ ok: true });

    const [stored] = await testDb
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, "dewi@example.com"))
      .limit(1);

    expect(stored).not.toBeNull();
    expect(stored?.role).toBe("MEMBER");
    expect(stored?.orgId).toBe(org.id);
    expect(stored?.name).toBe("Dewi Member");
    expect(stored?.authUserId).toBeTruthy();
    // AC-023: no password column — Supabase Auth owns the credential (ADR-0014).
    expect((stored as Record<string, unknown>).passwordHash).toBeUndefined();
    expect((stored as Record<string, unknown>).password).toBeUndefined();

    // The auth user really exists and carries the role/org_id app-metadata claims.
    const { data: authUser, error } = await admin.auth.admin.getUserById(
      stored!.authUserId!,
    );
    expect(error).toBeNull();
    expect(authUser?.user?.email).toBe("dewi@example.com");
    expect(authUser?.user?.app_metadata?.role).toBe("MEMBER");
    expect(authUser?.user?.app_metadata?.org_id).toBe(org.id);
  });

  it("rejects a password shorter than 6 chars without creating a row or auth user", async () => {
    const res = await signupAction({
      name: "Short Pw",
      email: "short@example.com",
      password: "12345",
    });
    expect(res).toEqual({ error: "Kata sandi minimal 6 karakter." });
    const rows = await testDb.select().from(appUsers);
    expect(rows.length).toBe(0);
    // No auth user created on a validation failure.
    expect(await countAuthUsersByEmail("short@example.com")).toBe(0);
  });

  it("AC-005: a real Supabase 'already registered' error maps to the duplicate message", async () => {
    // Pre-create the auth user so the second createUser inside signupAction trips
    // Supabase's email_exists path.
    const { error } = await admin.auth.admin.createUser({
      email: "dup-auth@example.com",
      password: "secret123",
      email_confirm: true,
    });
    expect(error).toBeNull();

    const res = await signupAction({
      name: "Dup Auth",
      email: "dup-auth@example.com",
      password: "secret123",
    });
    expect(res).toEqual({ error: "Email sudah terdaftar." });
    // No app_users row created on the auth-side duplicate.
    const rows = await testDb.select().from(appUsers);
    expect(rows.length).toBe(0);
  });

  it("TOCTOU: maps a 23505 unique violation to the duplicate error and cleans up the orphan auth user", async () => {
    // Pre-create the conflicting app_users row (linked to a REAL auth user so the
    // FK is satisfied) and force the pre-check to miss it (simulating a race).
    const [org] = await testDb
      .select()
      .from(organizations)
      .where(eq(organizations.slug, ORG_SLUG))
      .limit(1);
    const { data: seed, error: seedErr } = await admin.auth.admin.createUser({
      email: "race-seed@example.com",
      password: "secret123",
      email_confirm: true,
    });
    expect(seedErr).toBeNull();
    await testDb.insert(appUsers).values({
      orgId: org.id,
      email: "race@example.com",
      name: "Existing",
      role: "MEMBER",
      authUserId: seed.user!.id,
    });

    forceFindByEmailNull.value = true;
    try {
      const res = await signupAction({
        name: "Racer",
        email: "race@example.com",
        password: "secret123",
      });
      expect(res).toEqual({ error: "Email sudah terdaftar." });
    } finally {
      forceFindByEmailNull.value = false;
    }

    // Exactly the one pre-existing app_users row remains (no second insert).
    const rows = await testDb.select().from(appUsers);
    expect(rows.length).toBe(1);

    // M-3: signupAction created a SECOND auth user for "race@example.com" then
    // deleted it on the 23505 — so there is no orphan identity for that email.
    expect(await countAuthUsersByEmail("race@example.com")).toBe(0);
  });

  it("M-3: a non-duplicate profile-insert failure deletes the just-created auth user (no orphan)", async () => {
    // Force createMember to blow up AFTER createUser succeeds. signupAction must
    // delete the auth user it just minted so no orphan identity remains.
    forceCreateMemberThrow.value = true;

    await expect(
      signupAction({
        name: "Orphan Case",
        email: "orphan@example.com",
        password: "secret123",
      }),
    ).rejects.toThrow("forced profile-insert failure");

    forceCreateMemberThrow.value = false;

    // The orphan auth user was cleaned up — no identity lingers for this email.
    expect(await countAuthUsersByEmail("orphan@example.com")).toBe(0);
    // And no app_users row was committed.
    const rows = await testDb.select().from(appUsers);
    expect(rows.length).toBe(0);
  });

  it("AC-005: a second signup with the same email returns { error } and does not add a row", async () => {
    const first = await signupAction({
      name: "First",
      email: "dup@example.com",
      password: "secret123",
    });
    expect(first).toEqual({ ok: true });

    const countAfterFirst = (await testDb.select().from(appUsers)).length;

    const second = await signupAction({
      name: "Second",
      email: "DUP@example.com", // same email, different casing
      password: "another456",
    });

    expect(second).toHaveProperty("error");
    expect("error" in second && second.error).toBe("Email sudah terdaftar.");

    const countAfterSecond = (await testDb.select().from(appUsers)).length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });
});
