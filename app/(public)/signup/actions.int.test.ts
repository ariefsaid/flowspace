/**
 * Integration tests for app/(public)/signup/actions.ts (signupAction) on the
 * Supabase Auth + Drizzle stack (ADR-0014). Runs against the Supabase local
 * Postgres via TEST_DATABASE_URL.
 *
 * AC-004: signup mints a Supabase auth.users row (role/org_id app-metadata set via
 *         the admin API) and inserts a linked MEMBER `app_users` row carrying its
 *         `auth_user_id` — and NO password column (Supabase owns the credential).
 * AC-005: a duplicate email is rejected and leaves the user count unchanged.
 *
 * The Supabase admin client is mocked so the happy path is deterministic and does
 * not depend on the (occasionally slow) local Auth service; the auth-user-creation
 * contract (admin.createUser with role/org_id app_metadata) is asserted directly.
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
import * as schema from "@/lib/db/schema";
import { appUsers, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

/** Dedicated postgres-js + Drizzle client for the test DB. */
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

const ORG_SLUG = "signup-int-org";

// Partial mock of the users repo: createMember stays REAL (hits the test DB),
// but findByEmail can be forced to return null for the TOCTOU test, simulating
// a concurrent insert that slips past the pre-check and trips the DB's unique
// constraint (23505).
const { forceFindByEmailNull } = vi.hoisted(() => ({
  forceFindByEmailNull: { value: false },
}));

vi.mock("@/lib/db/users", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/db/users")>();
  return {
    ...actual,
    findByEmail: (email: string) =>
      forceFindByEmailNull.value
        ? Promise.resolve(null)
        : actual.findByEmail(email),
  };
});

// Mock the Supabase admin client: createUser returns a deterministic auth uuid
// and records the call so we can assert the app_metadata claims. `simulateAlreadyRegistered`
// flips it into the "user already registered" error path (Supabase-side duplicate).
const { adminState, lastCreateUserArgs } = vi.hoisted(() => ({
  adminState: { authUserId: "00000000-0000-0000-0000-000000000abc", simulateAlreadyRegistered: false },
  lastCreateUserArgs: { value: null as unknown },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: (args: unknown) => {
          lastCreateUserArgs.value = args;
          if (adminState.simulateAlreadyRegistered) {
            return Promise.resolve({
              data: { user: null },
              error: { message: "User already registered", code: "email_exists", status: 422 },
            });
          }
          return Promise.resolve({
            data: { user: { id: adminState.authUserId } },
            error: null,
          });
        },
      },
    },
  }),
}));

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
  adminState.simulateAlreadyRegistered = false;
  adminState.authUserId = "00000000-0000-0000-0000-000000000abc";
  lastCreateUserArgs.value = null;
});

afterAll(async () => {
  await testSql`TRUNCATE TABLE "app_users", "organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// Import under test AFTER the int setup file has overridden DATABASE_URL.
import { signupAction } from "./actions";

describe("signupAction", () => {
  it("AC-004: mints an auth user (role/org_id app-metadata) + a linked MEMBER row; no password column", async () => {
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

    // The auth user was created with the email/password and the role/org_id claims.
    const args = lastCreateUserArgs.value as {
      email: string;
      password: string;
      email_confirm: boolean;
      app_metadata: { role: string; org_id: string };
    };
    expect(args.email).toBe("dewi@example.com");
    expect(args.password).toBe("secret123");
    expect(args.email_confirm).toBe(true);
    expect(args.app_metadata).toEqual({ role: "MEMBER", org_id: org.id });

    const [stored] = await testDb
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, "dewi@example.com"))
      .limit(1);

    expect(stored).not.toBeNull();
    expect(stored?.role).toBe("MEMBER");
    expect(stored?.orgId).toBe(org.id);
    expect(stored?.name).toBe("Dewi Member");
    // The app_users row is linked 1:1 to the Supabase auth.users row.
    expect(stored?.authUserId).toBe("00000000-0000-0000-0000-000000000abc");
    // AC-023: no password column — Supabase Auth owns the credential (ADR-0014)
    expect((stored as Record<string, unknown>).passwordHash).toBeUndefined();
    expect((stored as Record<string, unknown>).password).toBeUndefined();
  });

  it("rejects a password shorter than 6 chars without creating a row", async () => {
    const res = await signupAction({
      name: "Short Pw",
      email: "short@example.com",
      password: "12345",
    });
    expect(res).toEqual({ error: "Kata sandi minimal 6 karakter." });
    const rows = await testDb.select().from(appUsers);
    expect(rows.length).toBe(0);
    // No auth user creation attempted on a validation failure.
    expect(lastCreateUserArgs.value).toBeNull();
  });

  it("AC-005: a Supabase 'already registered' error maps to the duplicate message", async () => {
    adminState.simulateAlreadyRegistered = true;
    // Force the pre-check to miss so the Supabase-side duplicate is what trips.
    forceFindByEmailNull.value = true;
    try {
      const res = await signupAction({
        name: "Dup Auth",
        email: "dup-auth@example.com",
        password: "secret123",
      });
      expect(res).toEqual({ error: "Email sudah terdaftar." });
    } finally {
      forceFindByEmailNull.value = false;
    }
    // No app_users row created on the auth-side duplicate.
    const rows = await testDb.select().from(appUsers);
    expect(rows.length).toBe(0);
  });

  it("TOCTOU: maps a 23505 unique violation to the duplicate error", async () => {
    // Pre-create the conflicting row directly so createMember hits 23505, and
    // force the pre-check to miss it (simulating a concurrent insert).
    const [org] = await testDb
      .select()
      .from(organizations)
      .where(eq(organizations.slug, ORG_SLUG))
      .limit(1);
    await testDb.insert(appUsers).values({
      orgId: org.id,
      email: "race@example.com",
      name: "Existing",
      role: "MEMBER",
      authUserId: "00000000-0000-0000-0000-00000000face",
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

    const rows = await testDb.select().from(appUsers);
    expect(rows.length).toBe(1);
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
