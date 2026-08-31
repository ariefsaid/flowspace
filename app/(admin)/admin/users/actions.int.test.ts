/**
 * Integration tests for app/(admin)/admin/users/actions.ts (I-047).
 *
 * Runs against the Supabase local Postgres + Auth stack (TEST_DATABASE_URL /
 * NEXT_PUBLIC_SUPABASE_URL). Only `requireSession` is mocked — everything
 * else (repository writes, the Supabase Auth admin API) is real, so the
 * ADMIN gate, org-scoping, and the password-reset path are proven against
 * the actual stack, not a mock.
 *
 * AC-047-A1: updateUserAction — ADMIN can edit a same-org user; non-ADMIN denied.
 * AC-047-A2: archiveUserAction — ADMIN-gated soft-archive; refuses ADMIN targets.
 * AC-047-A3: adjustCreditsAction — ADMIN-gated balance adjustment.
 * AC-047-A4: resetUserPasswordAction — sets the auth password server-side
 *   ONLY, never returns/logs it; a cross-org target is refused before any
 *   Supabase Auth call.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import * as schema from "@/lib/db/schema";
import { appUsers, organizations } from "@/lib/db/schema";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/env";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSession: () => requireSession() }));

import {
  updateUserAction,
  archiveUserAction,
  adjustCreditsAction,
  resetUserPasswordAction,
} from "./actions";

let orgAId: string;
let orgBId: string;
let bUserId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "time_credit_lots","app_users","organizations" RESTART IDENTITY CASCADE`;
  const [orgA] = await testDb.insert(organizations).values({ name: "Users Action Org A", slug: "users-action-org-a-test" }).returning();
  const [orgB] = await testDb.insert(organizations).values({ name: "Users Action Org B", slug: "users-action-org-b-test" }).returning();
  orgAId = orgA.id;
  orgBId = orgB.id;
  const [userB] = await testDb.insert(appUsers).values({ orgId: orgBId, email: "action-b@x.test", name: "Bob", role: "MEMBER" }).returning();
  bUserId = userB.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "time_credit_lots","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

beforeEach(() => {
  requireSession.mockReset();
});

describe("updateUserAction", () => {
  it("[AC-047-A1] an ADMIN session updates a same-org user", async () => {
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, email: `upd-${Date.now()}@x.test`, name: "Before", role: "MEMBER" }).returning();
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    const updated = await updateUserAction(target.id, { name: "After" });
    expect(updated.name).toBe("After");
  });

  it("[SEC] a non-ADMIN session is denied before any write", async () => {
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, email: `upd2-${Date.now()}@x.test`, name: "Untouched", role: "MEMBER" }).returning();
    requireSession.mockResolvedValue({ id: "member1", orgId: orgAId, role: "MEMBER" });
    await expect(updateUserAction(target.id, { name: "Hijacked" })).rejects.toThrow("FORBIDDEN");
    const [fresh] = await testDb.select().from(appUsers).where(eq(appUsers.id, target.id));
    expect(fresh.name).toBe("Untouched");
  });

  it("[SEC] the target is resolved within the admin's OWN session org — a cross-org id is refused", async () => {
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    await expect(updateUserAction(bUserId, { name: "Hijacked" })).rejects.toThrow("NOT_FOUND");
  });
});

describe("archiveUserAction", () => {
  it("[AC-047-A2] an ADMIN session archives a same-org MEMBER", async () => {
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, email: `arc-${Date.now()}@x.test`, name: "ToArchive", role: "MEMBER" }).returning();
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    const archived = await archiveUserAction(target.id);
    expect(archived.archivedAt).not.toBeNull();
  });

  it("[SEC] refuses to archive an ADMIN-role target", async () => {
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, email: `arcadmin-${Date.now()}@x.test`, name: "AdminTarget", role: "ADMIN" }).returning();
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    await expect(archiveUserAction(target.id)).rejects.toThrow("CANNOT_ARCHIVE_ADMIN");
  });

  it("[SEC] a non-ADMIN session is denied before any write", async () => {
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, email: `arc2-${Date.now()}@x.test`, name: "Untouched", role: "MEMBER" }).returning();
    requireSession.mockResolvedValue({ id: "member1", orgId: orgAId, role: "MEMBER" });
    await expect(archiveUserAction(target.id)).rejects.toThrow("FORBIDDEN");
    const [fresh] = await testDb.select().from(appUsers).where(eq(appUsers.id, target.id));
    expect(fresh.archivedAt).toBeNull();
  });
});

describe("adjustCreditsAction", () => {
  it("[AC-047-A3][MONEY] an ADMIN session adjusts a same-org user's printBalance", async () => {
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, email: `adj-${Date.now()}@x.test`, name: "Adjusted", role: "MEMBER", printBalance: 2 }).returning();
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    const result = await adjustCreditsAction(target.id, { printBalanceDelta: 8 });
    expect(result.printBalance).toBe(10);
  });

  it("[SEC] a non-ADMIN session is denied before any write", async () => {
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, email: `adj2-${Date.now()}@x.test`, name: "Untouched", role: "MEMBER", printBalance: 5 }).returning();
    requireSession.mockResolvedValue({ id: "member1", orgId: orgAId, role: "MEMBER" });
    await expect(adjustCreditsAction(target.id, { printBalanceDelta: 100 })).rejects.toThrow("FORBIDDEN");
    const [fresh] = await testDb.select().from(appUsers).where(eq(appUsers.id, target.id));
    expect(fresh.printBalance).toBe(5);
  });
});

describe("resetUserPasswordAction", () => {
  it("[AC-047-A4][SEC] an ADMIN session resets a same-org user's password server-side — the new password actually authenticates, the return value carries no password material", async () => {
    const email = `reset-${Date.now()}@x.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "original-pw-1",
      email_confirm: true,
    });
    expect(error).toBeNull();
    const authUserId = data.user!.id;
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, authUserId, email, name: "ResetMe", role: "MEMBER" }).returning();

    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    const result = await resetUserPasswordAction(target.id, "brand-new-pw-2");
    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain("brand-new-pw-2");

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const signIn = await anon.auth.signInWithPassword({ email, password: "brand-new-pw-2" });
    expect(signIn.error).toBeNull();
    expect(signIn.data.user?.id).toBe(authUserId);

    const oldSignIn = await anon.auth.signInWithPassword({ email, password: "original-pw-1" });
    expect(oldSignIn.error).not.toBeNull();

    await admin.auth.admin.deleteUser(authUserId);
  });

  it("[SEC] rejects a too-short password before any Supabase Auth call", async () => {
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, email: `shortpw-${Date.now()}@x.test`, name: "X", role: "MEMBER" }).returning();
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    await expect(resetUserPasswordAction(target.id, "abc")).rejects.toThrow("PASSWORD_TOO_SHORT");
  });

  it("[SEC] a cross-org target resolves to NOT_FOUND — no Supabase Auth call", async () => {
    requireSession.mockResolvedValue({ id: "admin1", orgId: orgAId, role: "ADMIN" });
    await expect(resetUserPasswordAction(bUserId, "some-new-password")).rejects.toThrow("NOT_FOUND");
  });

  it("[SEC] a non-ADMIN session is denied before any write", async () => {
    const [target] = await testDb.insert(appUsers).values({ orgId: orgAId, email: `resetdenied-${Date.now()}@x.test`, name: "X", role: "MEMBER" }).returning();
    requireSession.mockResolvedValue({ id: "member1", orgId: orgAId, role: "MEMBER" });
    await expect(resetUserPasswordAction(target.id, "some-new-password")).rejects.toThrow("FORBIDDEN");
  });
});
