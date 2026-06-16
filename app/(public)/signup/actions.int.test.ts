/**
 * Integration tests for app/(public)/signup/actions.ts (signupAction).
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * AC-004: signup creates a MEMBER row (no password column; Supabase Auth owns credentials).
 * AC-005: a duplicate email is rejected and leaves the user count unchanged.
 *
 * Phase 2 bridge: signupAction still calls prisma for org lookup (ported in Phase 3).
 * The test harness has been ported to Drizzle (Phase 2 cutover, Task 2.1).
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
});

afterAll(async () => {
  await testSql`TRUNCATE TABLE "app_users", "organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// Import under test AFTER the int setup file has overridden DATABASE_URL.
import { signupAction } from "./actions";

describe("signupAction", () => {
  it("AC-004: creates a MEMBER row with correct orgId; no password column (ADR-0014)", async () => {
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
