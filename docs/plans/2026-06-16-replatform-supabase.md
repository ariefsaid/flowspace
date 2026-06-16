# Plan — I-005: Backend re-platform to Supabase + Drizzle + Supabase Auth

- Date: 2026-06-16
- Issue: I-005
- Spec preserved: `docs/specs/0002-auth-foundation.spec.md` (every I-004 AC must still pass)
- ADRs: [0013](../adr/0013-backend-platform-supabase.md) (platform), [0014](../adr/0014-auth-supabase.md) (auth),
  [0015](../adr/0015-drizzle-rls-on-supabase.md) (Drizzle + RLS), [0010](../adr/0010-test-strategy-pyramid.md) (test DB).
- Nature: **behavior-preserving re-platform.** No new ACs. The bar is: the existing I-004 ACs prove green on the new
  stack, the tree stays green at every phase boundary, and Prisma/NextAuth are fully removed by the end.

## Guardrails (binding for the implementer)
- TDD-first: write the failing test (or migrate the existing test to the new stack) **before** the implementation.
  Where a test already exists and only its *backend* changes (e.g. `users.int.test.ts`), porting it to fail against
  the new harness first IS the red step.
- Type/signature consistency: `lib/db/users.ts` keeps its exact exported signatures; `getSessionUser`/
  `requireSession` keep their exact return shape; `requiredRolesFor`/`roleHome`/`can` are unchanged.
- The implementer writes source/tests; this plan is the contract. No placeholders — every task has exact paths,
  real code, and an exact verify command.
- **Cutover order is load-bearing:** stand up Supabase + Drizzle *alongside* Prisma/NextAuth, port the data layer,
  port auth, swap CI, then delete the old stack — so `pnpm test` + `pnpm build` pass at each phase boundary.

---

## Decisions needing owner / Director sign-off (resolve before Phase 0)
- **OQ-A (edge session read):** middleware validates the Supabase session via `auth.getUser()` (one round-trip,
  correct) vs local JWT-signature verify (zero round-trip, small revocation-staleness window). **Recommend
  `getUser()` now**, optimise later. (ADR-0014 §3.)
- **OQ-B (migration tool):** drizzle-kit owns app DDL; `supabase/migrations` owns RLS/Storage/Realtime/auth-link.
  **Recommend as written** (ADR-0015 §2). Owner confirm the two-directory split is acceptable.
- **OQ-C (Supabase project: cloud vs local-only for now):** this plan stands up **local-only** (Supabase CLI) for
  dev/CI; no cloud project is provisioned in I-005. Prod cloud project + data-residency is a deferred,
  owner-gated infra decision (ADR-0013). Owner confirm: local-only for I-005?
- **OQ-D (email confirmation):** dev/test set `enable_confirmations = false` for AC-004 parity (signup → signed in).
  Production confirmation policy deferred (ADR-0014). Owner confirm dev parity choice.
- **OQ-E (role/org claim sync):** `role` and `org_id` are mirrored into the Supabase JWT as app-metadata claims at
  signup (and on any future role change) so the edge gate and RLS read them claim-only. Confirm this is the source
  of the claim (vs a DB trigger). **Recommend server-side admin-API set at signup** (ADR-0014 §1, §3).

---

## Phase 0 — Supabase local stack + Drizzle scaffold (alongside Prisma; tree stays green)

### Task 0.1 — Add Supabase CLI config + dev/test/CI env wiring
- **Files:** create `supabase/config.toml`; edit `.env.example`.
- **Change — `supabase/config.toml`** (minimal, local stack; ports are Supabase CLI defaults):
  ```toml
  project_id = "flowspace"

  [api]
  enabled = true
  port = 54321
  schemas = ["public", "storage", "graphql_public"]

  [db]
  port = 54322
  major_version = 16

  [studio]
  enabled = true
  port = 54323

  [auth]
  enabled = true
  site_url = "http://localhost:3000"
  # AC-004 parity: signup signs the user straight in (no email round-trip) in dev/test.
  enable_confirmations = false

  [auth.email]
  enable_signup = true
  ```
- **Change — append to `.env.example`** (placeholders only; never real keys):
  ```bash
  # --- Supabase (local stack via `supabase start`) ---
  # App DB connection (pooled). drizzle uses this; the server connects privileged.
  DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres"
  # Throwaway DB for integration tests (the same local stack DB; tests truncate between runs).
  TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres"
  NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
  NEXT_PUBLIC_SUPABASE_ANON_KEY="REPLACE_WITH_LOCAL_ANON_KEY"   # from `supabase start` output
  SUPABASE_SERVICE_ROLE_KEY="REPLACE_WITH_LOCAL_SERVICE_ROLE_KEY"  # server-only, NEVER NEXT_PUBLIC
  ```
- **Verify:** `test -f supabase/config.toml && grep -q enable_confirmations supabase/config.toml && echo OK`
- **AC:** none (infra). Note: `DIRECT_URL`/Neon vars are removed from `.env.example` in Task 6.4.

### Task 0.2 — Install Supabase + Drizzle deps; add db scripts (Prisma scripts stay for now)
- **Files:** `package.json`.
- **Change — add to `dependencies`:** `@supabase/supabase-js`, `@supabase/ssr`, `drizzle-orm`, `postgres`.
  **add to `devDependencies`:** `drizzle-kit`, `supabase` (CLI). Remove nothing yet.
- **Change — add scripts (keep the existing `db:*` Prisma scripts until Phase 6):**
  ```json
  "sb:start": "supabase start",
  "sb:stop": "supabase stop",
  "dz:generate": "drizzle-kit generate",
  "dz:migrate": "drizzle-kit migrate",
  "dz:studio": "drizzle-kit studio"
  ```
- **Verify:** `pnpm install && pnpm exec drizzle-kit --version && pnpm exec supabase --version`
- **AC:** none.

### Task 0.3 — Drizzle config
- **Files:** create `drizzle.config.ts`.
- **Change:**
  ```ts
  import { defineConfig } from "drizzle-kit";

  export default defineConfig({
    schema: "./lib/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: { url: process.env.DATABASE_URL! },
    // App tables only; RLS/Storage/Realtime live in supabase/migrations (ADR-0015 §2).
    schemaFilter: ["public"],
    tablesFilter: ["organizations", "app_users"],
  });
  ```
- **Verify:** `pnpm exec drizzle-kit check 2>/dev/null; test -f drizzle.config.ts && echo OK`
- **AC:** none.

---

## Phase 1 — Drizzle schema + enums + client (port of `prisma/schema.prisma`)

### Task 1.1 — Shared enum source of truth (replaces `@prisma/client` enum types)
- **Files:** create `lib/db/enums.ts`.
- **Change:**
  ```ts
  /** Single source of truth for app enums (replaces @prisma/client enums, ADR-0015 §1). */
  export const ROLES = ["MEMBER", "ADMIN", "BARISTA"] as const;
  export type Role = (typeof ROLES)[number];

  export const MEMBERSHIP_TIERS = ["REGULAR", "PREMIUM", "GOLD"] as const;
  export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];
  ```
- **Verify:** `pnpm exec tsc --noEmit lib/db/enums.ts` (or `pnpm typecheck` after Task 1.2).
- **AC:** none (type seam; AC-022/AC-001 logic depends on it and is re-verified in Phase 3).

### Task 1.2 — Drizzle schema for `organizations` + `app_users` (FR-021, links to auth.users)
- **Files:** create `lib/db/schema.ts`.
- **Test first (RED):** create `lib/db/schema.test.ts` (unit) — asserts the table column set matches FR-021 and the
  enum pgEnums carry the ADR values:
  ```ts
  import { describe, expect, it } from "vitest";
  import { getTableColumns } from "drizzle-orm";
  import { appUsers, organizations, roleEnum, membershipTierEnum } from "@/lib/db/schema";

  describe("schema", () => {
    it("app_users has the FR-021 columns and an auth_user_id link, no password column", () => {
      const cols = Object.keys(getTableColumns(appUsers));
      for (const c of ["id","orgId","authUserId","email","name","role","membershipTier","timeCredits","printBalance","createdAt","updatedAt","archivedAt"])
        expect(cols).toContain(c);
      expect(cols).not.toContain("passwordHash"); // AC-023: no app-side password column (ADR-0014 §1)
      expect(cols).not.toContain("password");
    });
    it("organizations has id/name/slug/createdAt/updatedAt", () => {
      const cols = Object.keys(getTableColumns(organizations));
      for (const c of ["id","name","slug","createdAt","updatedAt"]) expect(cols).toContain(c);
    });
    it("enums carry the ADR values", () => {
      expect(roleEnum.enumValues).toEqual(["MEMBER","ADMIN","BARISTA"]);
      expect(membershipTierEnum.enumValues).toEqual(["REGULAR","PREMIUM","GOLD"]);
    });
  });
  ```
- **Change — `lib/db/schema.ts`** (preserve snake_case column names from the Prisma `@map`s exactly so the SQL
  shape is identical; `id` keeps the cuid-style text PK so existing ids/contracts are unaffected):
  ```ts
  import { pgTable, pgEnum, text, integer, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
  import { createId } from "@paralleldrive/cuid2"; // see note below
  import type { InferSelectModel } from "drizzle-orm";

  export const roleEnum = pgEnum("Role", ["MEMBER", "ADMIN", "BARISTA"]);
  export const membershipTierEnum = pgEnum("MembershipTier", ["REGULAR", "PREMIUM", "GOLD"]);

  export const organizations = pgTable("organizations", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  }, (t) => ({ slugUq: uniqueIndex("organizations_slug_key").on(t.slug) }));

  export const appUsers = pgTable("app_users", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    // Links 1:1 to Supabase auth.users (ADR-0014 §1). FK added in a supabase/ migration (Task 4.2).
    authUserId: uuid("auth_user_id"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull().default("MEMBER"),
    membershipTier: membershipTierEnum("membership_tier").notNull().default("REGULAR"),
    timeCredits: integer("time_credits").notNull().default(0),
    printBalance: integer("print_balance").notNull().default(0),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { precision: 3, mode: "date" }),
  }, (t) => ({
    emailUq: uniqueIndex("app_users_email_key").on(t.email),
    authUserUq: uniqueIndex("app_users_auth_user_id_key").on(t.authUserId),
    orgIdx: index("app_users_org_id_idx").on(t.orgId),
  }));

  export type AppUser = InferSelectModel<typeof appUsers>;
  export type Organization = InferSelectModel<typeof organizations>;
  ```
  Note: add `@paralleldrive/cuid2` to deps in this task (matches the Prisma cuid id shape so seeded/known ids stay
  textual; alternatively switch PKs to `uuid` defaultRandom — but text+cuid2 is the **lowest-drift** port).
- **Verify (RED→GREEN):** `pnpm test:unit -- lib/db/schema.test.ts`
- **AC:** AC-023 (partial — "no password column" contract; full AC-023 owned by the int test in Task 2.2).

### Task 1.3 — Drizzle client singleton (replaces the Prisma singleton; old one stays until Phase 6)
- **Files:** create `lib/db/drizzle.ts` (new name so `lib/db/client.ts` Prisma stays importable during the port).
- **Change:**
  ```ts
  /** Drizzle client singleton over Supabase Postgres (server-side; ADR-0015 §1). */
  import { drizzle } from "drizzle-orm/postgres-js";
  import postgres from "postgres";
  import * as schema from "@/lib/db/schema";

  const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
  const sql = globalForDb.sql ?? postgres(process.env.DATABASE_URL!, { prepare: false });
  if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

  export const db = drizzle(sql, { schema });
  ```
- **Verify:** `pnpm typecheck`
- **AC:** none.

### Task 1.4 — Generate the initial Drizzle migration for app tables
- **Files:** create `drizzle/0000_init.sql` (generated) + `drizzle/meta/*`.
- **Change:** run `pnpm dz:generate`. Confirm the emitted SQL creates the `Role`/`MembershipTier` enums, both
  tables, the unique indexes (`organizations_slug_key`, `app_users_email_key`, `app_users_auth_user_id_key`), the
  `app_users_org_id_idx` index, and the `org_id` FK — i.e. the same shape as the Prisma migration plus
  `auth_user_id`. **Down step (reversibility):** document the inverse in `drizzle/0000_init.down.sql`
  (`DROP TABLE app_users; DROP TABLE organizations; DROP TYPE "MembershipTier"; DROP TYPE "Role";`).
- **Verify:** `pnpm sb:start && pnpm dz:migrate && psql "$DATABASE_URL" -c '\d app_users' | grep -q auth_user_id && echo OK`
- **AC:** FR-021 (schema reversibility; proven by apply+inspect).

---

## Phase 2 — Port the repository + signup data path to Drizzle (data layer, no auth yet)

### Task 2.1 — Port `lib/db/users.int.test.ts` to the Drizzle/Supabase harness (RED)
- **Files:** edit `lib/db/users.int.test.ts`; create `vitest.setup.int.ts` change in Task 2.4.
- **Change:** replace the dedicated `PrismaClient` with a dedicated `postgres-js` + Drizzle test client against
  `TEST_DATABASE_URL`; replace `testPrisma.$executeRaw\`TRUNCATE …\`` with the equivalent Drizzle
  `db.execute(sql\`TRUNCATE TABLE "app_users","organizations" RESTART IDENTITY CASCADE\`)`; replace
  `testPrisma.organization.create`/`appUser.create`/`appUser.findUnique` with Drizzle `insert`/`select`. Drop
  `bcrypt.hashSync` for `passwordHash` (no longer a column) — seed users now carry only domain columns; the
  AC-023 assertion changes to "no `password*` column exists on the row" (see Task 2.2). **Keep every `it(...)` title
  and its AC-021 assertions identical.**
- **Verify (RED, before 2.3):** `pnpm test:int -- lib/db/users.int.test.ts` → fails (repo not ported yet).
- **AC:** AC-021 (owning layer: integration) — preserved.

### Task 2.2 — Rewrite the AC-023 no-plaintext assertion for the Supabase model (RED)
- **Files:** edit `lib/db/users.int.test.ts` (the AC-023 `describe`).
- **Change:** AC-023 no longer reads back a `passwordHash`; it asserts the **schema** has no password column and
  that `createMember` neither accepts nor stores a password:
  ```ts
  describe("AC-023: no plaintext (and no application password column at all)", () => {
    it("AC-023: app_users has no password/password_hash column; createMember stores none", async () => {
      const cols = await testDb.execute(sql`
        select column_name from information_schema.columns
        where table_name = 'app_users'`);
      const names = cols.map((r: { column_name: string }) => r.column_name);
      expect(names).not.toContain("password");
      expect(names).not.toContain("password_hash");
      const user = await createMember({ orgId: orgAId, authUserId: crypto.randomUUID(),
        email: "newmember@x.test", name: "New Member" });
      expect((user as Record<string, unknown>).password).toBeUndefined();
      expect((user as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });
  ```
- **Verify (RED):** `pnpm test:int -- lib/db/users.int.test.ts`
- **AC:** AC-023 (owning layer: integration) — preserved, strengthened (no password column exists).

### Task 2.3 — Reimplement `lib/db/users.ts` on Drizzle (same signatures, +authUserId) (GREEN)
- **Files:** edit `lib/db/users.ts`.
- **Change:** keep the exported functions and `org_id`-scoping; `createMember` now takes `authUserId` instead of
  `passwordHash`; the row type is the Drizzle `AppUser`:
  ```ts
  import { and, eq, isNull, asc } from "drizzle-orm";
  import { db } from "@/lib/db/drizzle";
  import { appUsers, type AppUser } from "@/lib/db/schema";

  export async function findByEmail(email: string): Promise<AppUser | null> {
    const [u] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
    return u ?? null;
  }
  export async function findByAuthUserId(authUserId: string): Promise<AppUser | null> {
    const [u] = await db.select().from(appUsers).where(eq(appUsers.authUserId, authUserId)).limit(1);
    return u ?? null;
  }
  export async function findById(orgId: string, id: string): Promise<AppUser | null> {
    const [u] = await db.select().from(appUsers)
      .where(and(eq(appUsers.id, id), eq(appUsers.orgId, orgId), isNull(appUsers.archivedAt))).limit(1);
    return u ?? null;
  }
  export async function listByOrg(orgId: string): Promise<AppUser[]> {
    return db.select().from(appUsers)
      .where(and(eq(appUsers.orgId, orgId), isNull(appUsers.archivedAt))).orderBy(asc(appUsers.name));
  }
  export async function createMember(input: {
    orgId: string; authUserId: string; email: string; name: string;
  }): Promise<AppUser> {
    const [u] = await db.insert(appUsers)
      .values({ orgId: input.orgId, authUserId: input.authUserId, email: input.email, name: input.name, role: "MEMBER" })
      .returning();
    return u;
  }
  ```
  `findByAuthUserId` is new (the session resolver in Phase 3 uses it). The unique `email` + `auth_user_id`
  constraints are the TOCTOU guards (replacing Prisma P2002 → see Task 3.4).
- **Verify (GREEN):** `pnpm test:int -- lib/db/users.int.test.ts` → AC-021 + AC-023 pass.
- **AC:** AC-021, AC-023 (integration).

### Task 2.4 — Point the integration setup at the Supabase local DB
- **Files:** edit `vitest.setup.int.ts`.
- **Change:** default `TEST_DATABASE_URL` to `postgresql://postgres:postgres@localhost:54322/postgres` (the
  Supabase local stack). Keep the "override `DATABASE_URL` before the client module loads" behavior.
- **Verify:** `pnpm test:int` (whole integration project green against the local stack).
- **AC:** none (harness).

### Task 2.5 — Port the seed to Drizzle + Supabase Auth users (FR-022)
- **Files:** rewrite `prisma/seed.ts` → create `scripts/seed.ts` (move off `prisma/`); update the `db:seed` script
  target in Task 6.3.
- **Change:** for each of the 3 seed users (admin / member "Budi" PREMIUM credits 139 print 68 / barista), create
  the Supabase Auth user via the admin client (`supabase.auth.admin.createUser({ email, password,
  email_confirm: true, app_metadata: { role, org_id } })`), then upsert the linked `app_users` row
  (`authUserId = data.user.id`, role, tier, credits). Passwords stay env-driven with dev fallbacks
  (`SEED_ADMIN_PASSWORD` …), never committed. Org upsert by `slug` unchanged.
- **Verify:** `pnpm tsx scripts/seed.ts && psql "$DATABASE_URL" -c "select email, role from app_users order by role"`
- **AC:** FR-022 (seed parity — the dashboard renders Budi's 139/68; the e2e creds resolve).

---

## Phase 3 — Port auth to Supabase Auth (session shape preserved)

### Task 3.1 — Supabase server/browser/admin clients (`@supabase/ssr`)
- **Files:** create `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/client.ts`.
- **Change:**
  - `server.ts` — `createServerClient(URL, ANON_KEY, { cookies })` using `next/headers` cookies (RSC/route-handler
    session reads).
  - `admin.ts` — `createClient(URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false }})`
    (server-only; used by signup + seed to mint auth users and set `app_metadata`). Never imported client-side.
  - `client.ts` — `createBrowserClient(URL, ANON_KEY)` for the login/signup components' `signInWithPassword`.
- **Verify:** `pnpm typecheck`
- **AC:** none.

### Task 3.2 — Pure session-claims mapper (AC-020 moves here from the NextAuth callbacks) (RED→GREEN)
- **Files:** create `lib/auth/session-claims.ts`; create `lib/auth/session-claims.test.ts`.
- **Test first (RED)** — re-encode AC-020 against the mapper (replaces `lib/auth.config.test.ts`):
  ```ts
  import { describe, expect, it } from "vitest";
  import { toSessionUser } from "@/lib/auth/session-claims";

  describe("toSessionUser", () => {
    it("AC-020: maps auth user + profile to { id, role, orgId, email, name }", () => {
      const u = toSessionUser(
        { id: "auth-uuid", email: "a@b.c" },
        { id: "u1", role: "ADMIN", orgId: "org1", email: "a@b.c", name: "Admin" } as never,
      );
      expect(u).toEqual({ id: "u1", role: "ADMIN", orgId: "org1", email: "a@b.c", name: "Admin" });
    });
    it("AC-020: returns null when there is no profile row", () => {
      expect(toSessionUser({ id: "x", email: "a@b.c" }, null)).toBeNull();
    });
  });
  ```
- **Change — `lib/auth/session-claims.ts`:**
  ```ts
  import type { AppUser } from "@/lib/db/schema";
  import type { Role } from "@/lib/db/enums";
  export type SessionUser = { id: string; role: Role; orgId: string; email: string; name: string };
  export function toSessionUser(
    authUser: { id: string; email?: string | null },
    profile: AppUser | null,
  ): SessionUser | null {
    if (!profile) return null;
    return { id: profile.id, role: profile.role, orgId: profile.orgId,
             email: profile.email, name: profile.name };
  }
  ```
- **Verify (GREEN):** `pnpm test:unit -- lib/auth/session-claims.test.ts`
- **AC:** AC-020 (owning layer: unit) — preserved.

### Task 3.3 — Reimplement `lib/auth/session.ts` on Supabase (same return shape) (GREEN)
- **Files:** edit `lib/auth/session.ts`; edit `lib/auth/session.test.ts`.
- **Test change:** the existing unit test mocks `@/lib/auth` (NextAuth). Re-point it to mock the Supabase server
  client + `findByAuthUserId`; keep both `it(...)` cases (authenticated returns the user; unauth → null /
  `requireSession` throws `UNAUTHENTICATED`) and the **same return shape** `{ id, role, orgId, email, name }`.
- **Change — `lib/auth/session.ts`:**
  ```ts
  import { createSupabaseServerClient } from "@/lib/supabase/server";
  import { findByAuthUserId } from "@/lib/db/users";
  import { toSessionUser, type SessionUser } from "@/lib/auth/session-claims";

  export async function getSessionUser(): Promise<SessionUser | null> {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const profile = await findByAuthUserId(user.id);
    return toSessionUser(user, profile);
  }
  export async function requireSession(): Promise<SessionUser> {
    const user = await getSessionUser();
    if (!user) throw new Error("UNAUTHENTICATED");
    return user;
  }
  ```
- **Verify (GREEN):** `pnpm test:unit -- lib/auth/session.test.ts`
- **AC:** supports AC-020/AC-021 consumers; no new AC (shape contract preserved).

### Task 3.4 — Reimplement the signup server action on Supabase Auth (AC-004/AC-005) (RED→GREEN)
- **Files:** edit `app/(public)/signup/actions.ts`; edit `app/(public)/signup/actions.int.test.ts`.
- **Test change (RED):** port the existing int test to the Drizzle/Supabase harness — keep the AC-004 and AC-005
  `it(...)` titles and assertions, but: (a) verify the created row has a `authUserId` (not `passwordHash`); (b) the
  duplicate path now trips the Supabase Auth "user already registered" error **or** the `app_users` unique-email
  constraint — both map to `"Email sudah terdaftar."`; (c) replace the Prisma-P2002 TOCTOU case with the Drizzle
  unique-violation (`error.code === "23505"`) → same duplicate message.
- **Change — `actions.ts`:** validate password ≥6 (unchanged message); call
  `admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: "MEMBER", org_id }})`
  where `org_id` is resolved from the seeded org (`SEED_ORG_SLUG` lookup via Drizzle); on Supabase "already
  registered" → `{ error: "Email sudah terdaftar." }`; else `createMember({ orgId, authUserId: data.user.id,
  email, name })`; map a Postgres `23505` unique violation to the same duplicate message (TOCTOU guard). Return
  `{ ok: true }`. The component then calls `supabase.auth.signInWithPassword` client-side → `/dashboard`.
- **Verify (GREEN):** `pnpm test:int -- app/(public)/signup/actions.int.test.ts`
- **AC:** AC-004 (integration), AC-005 (referenced at integration; e2e owner unchanged — see table).

### Task 3.5 — Rewire login + signup components to Supabase Auth (preserve AC-003 generic error)
- **Files:** edit `app/(public)/login/page.tsx`, `app/(public)/signup/page.tsx`,
  `app/(public)/login/__tests__/login-page.test.tsx`.
- **Change — login:** replace `signIn("credentials", …)`/`getSession()` with the browser Supabase client:
  `const { data, error } = await supabase.auth.signInWithPassword({ email, password })`. On **any** `error` →
  `setError("Email atau kata sandi salah.")` (AC-003 — identical message for wrong-password and unknown-email;
  Supabase returns the same opaque `Invalid login credentials` for both, ADR-0014). On success, resolve role from
  `data.session.user.app_metadata.role` (claim) and `window.location.href = roleHome(role)`. Import `roleHome` and
  `Role` from their unchanged modules (`@/lib/auth/route-policy`, `@/lib/db/enums`).
- **Change — signup component:** after `signupAction` success, `supabase.auth.signInWithPassword(...)` then
  redirect to `/dashboard` (AC-004).
- **Test change — `login-page.test.tsx`:** swap the `vi.mock("next-auth/react", …)` for a mock of the Supabase
  browser client whose `signInWithPassword` resolves `{ error }`; **keep both AC-003 cases and their identical
  expected message**.
- **Verify:** `pnpm test:unit -- app/(public)/login/__tests__/login-page.test.tsx`
- **AC:** AC-003 (owning layer: unit) — preserved.

### Task 3.6 — Edge middleware reads the Supabase session (route-gate unchanged) (OQ-A)
- **Files:** rewrite `middleware.ts`; create `lib/supabase/middleware.ts` (cookie-bridged server client for Edge).
- **Change — `middleware.ts`:** build a `createServerClient` bound to `request`/`response` cookies; call
  `const { data: { user } } = await supabase.auth.getUser()`. Read `role` from `user?.app_metadata?.role` (claim).
  Then apply the **existing** policy: `const required = requiredRolesFor(pathname)`; `if (required === "public")
  return res`; `if (!role) → redirect /login?callbackUrl=<path>`; `if (required.length === 0) return res`;
  `if (required.includes(role)) return res`; else `redirect(roleHome(role))`. Keep the existing `matcher`. This is
  the same decision table as `lib/auth.config.ts`'s `authorized` callback, now inline (the callback file is deleted
  in Phase 6).
- **Verify:** `pnpm build` (Edge bundle compiles; no Node-only import leaks — `@supabase/ssr` is Edge-safe).
- **AC:** enables AC-010/011/014 (owned by e2e in Phase 5).

### Task 3.7 — Update the session-typing + `can()`/`route-policy` enum imports
- **Files:** edit `lib/auth/route-policy.ts`, `lib/auth/policy.ts`; delete `types/next-auth.d.ts` (replaced by
  `SessionUser`); edit `components/providers/SessionProvider.tsx`, `components/layout/MemberHeader.tsx`,
  `components/layout/AdminHeader.tsx`.
- **Change:** re-point `import type { Role } from "@prisma/client"` → `@/lib/db/enums` in `route-policy.ts` and
  `policy.ts` (their logic is unchanged → AC-001/AC-012/AC-013/AC-015/AC-022 still pass). Replace the
  `next-auth/react` `SessionProvider`/`useSession`/`signOut` usage in the headers with a Supabase-backed session
  context: a small `components/providers/SessionProvider.tsx` that wraps the Supabase browser client and exposes
  `{ user }`; `MemberHeader`/`AdminHeader` read `user.name` from it and call `supabase.auth.signOut()` →
  `/login`. (Behavior identical: shows the name, signs out to `/login`.)
- **Verify:** `pnpm test:unit -- lib/auth/route-policy.test.ts lib/auth/policy.test.ts && pnpm typecheck`
- **AC:** AC-001, AC-012, AC-013, AC-015, AC-022 (all unit) — preserved.

---

## Phase 4 — RLS backstop + Realtime/Storage seams (Supabase-owned migrations)

### Task 4.1 — `app_users ↔ auth.users` FK + `org_id` claim helper (supabase migration)
- **Files:** create `supabase/migrations/0001_auth_link.sql`.
- **Change:** `ALTER TABLE app_users ADD CONSTRAINT app_users_auth_user_fk FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;` plus a SQL helper
  `create or replace function current_org() returns text language sql stable as $$ select
  nullif(current_setting('request.jwt.claims', true)::json ->> 'org_id','') $$;`. Down step documented in
  `supabase/migrations/0001_auth_link.down.sql`.
- **Verify:** `pnpm dz:migrate && psql "$DATABASE_URL" -f supabase/migrations/0001_auth_link.sql && psql "$DATABASE_URL" -c "select current_org()"`
- **AC:** none (enables RLS + the auth link).

### Task 4.2 — RLS policy on `app_users` (org isolation backstop) (RED→GREEN)
- **Files:** create `supabase/migrations/0002_rls_app_users.sql`; create `lib/db/rls.int.test.ts`.
- **Test first (RED)** — the lean ADR-0015 §3 proof, integration layer:
  ```ts
  // AC-021 (RLS backstop): a cross-org row is invisible under a scoped (claim=orgA) connection.
  it("AC-021 (RLS backstop): scoped role sees only its org's rows", async () => {
    // open a connection that runs as the limited role with request.jwt.claims set to org A
    await scoped(orgAId, async (sdb) => {
      const rows = await sdb.select().from(appUsers);
      const emails = rows.map((r) => r.email);
      expect(emails).toContain("a@x.test");
      expect(emails).not.toContain("b@x.test"); // org B hidden by RLS
    });
  });
  ```
  (`scoped()` helper: `set local role authenticated; set local request.jwt.claims = '{"org_id":"<orgA>"}'`
  inside a transaction.)
- **Change — `0002_rls_app_users.sql`:**
  ```sql
  alter table app_users enable row level security;
  create policy app_users_org_isolation on app_users
    for all to authenticated
    using (org_id = current_org()) with check (org_id = current_org());
  ```
  Down: `drop policy app_users_org_isolation on app_users; alter table app_users disable row level security;`
- **Verify (GREEN):** `pnpm dz:migrate && pnpm test:int -- lib/db/rls.int.test.ts`
- **AC:** AC-021 (backstop reference; the **authoritative** AC-021 stays the repository int test in Task 2.3 — RLS
  is defense-in-depth, ADR-0015 §3).

### Task 4.3 — Realtime seam + smoke test (scaffold only, no domain) (RED→GREEN)
- **Files:** create `lib/realtime/channel.ts`; create `lib/realtime/channel.int.test.ts`.
- **Change — `channel.ts`:** a thin `subscribeToOrgChannel(orgId, event, handler)` util returning an unsubscribe
  fn, wrapping `supabase.channel(\`org:${orgId}\`).on('broadcast', { event }, handler).subscribe()`. No KDS/order
  domain — just the seam.
- **Test (RED→GREEN):** integration smoke against the local stack — publish a broadcast on `org:test` and assert
  the handler fires once within a timeout; assert unsubscribe stops further delivery.
- **Verify:** `pnpm test:int -- lib/realtime/channel.int.test.ts`
- **AC:** none (future-seam scaffold; ADR-0013 scope).

### Task 4.4 — Storage seam + smoke test (scaffold only, no print domain) (RED→GREEN)
- **Files:** create `supabase/migrations/0003_storage_bucket.sql` (create a private `print-uploads` bucket via
  `storage.buckets` insert); create `lib/storage/uploads.ts`; create `lib/storage/uploads.int.test.ts`.
- **Change — `uploads.ts`:** `uploadPrintDocument(orgId, path, file)` and `getSignedDownloadUrl(path)` wrapping
  `supabase.storage.from('print-uploads')` (server client, service role). No print billing — just the seam.
- **Test (RED→GREEN):** integration smoke — upload a tiny buffer, get a signed URL, assert it resolves; clean up.
- **Verify:** `pnpm dz:migrate && pnpm test:int -- lib/storage/uploads.int.test.ts`
- **AC:** none (future-seam scaffold).

---

## Phase 5 — E2E on the new stack (re-prove the cross-stack security ACs)

### Task 5.1 — Port the e2e login helper + auth flow to Supabase forms
- **Files:** edit `e2e/AC-002-admin-login.spec.ts`, `e2e/AC-010-server-side-authz.spec.ts`, `e2e/smoke.spec.ts`.
- **Change:** the selectors (`input[type=email]`, `input[type=password]`, `button[type=submit]`) are unchanged
  (the forms keep their markup), so the helper is unchanged. Verify the seeded dev creds still resolve
  (`admin@flowspace.test`/`dev-admin-pw`, `budi@flowspace.test`/`dev-member-pw`) now that they live in Supabase
  Auth (seeded in Task 2.5). No assertion changes — AC-002/AC-010/AC-011 keep their titles and oracles
  (content-absence of "Admin Dashboard"/"Dashboard Barista").
- **Verify:** `pnpm sb:start && pnpm dz:migrate && pnpm tsx scripts/seed.ts && pnpm build && pnpm e2e`
- **AC:** AC-002 (e2e), AC-010 (e2e), AC-011 (e2e) — preserved on the new stack.

### Task 5.2 — Confirm public-path + unauth-redirect e2e (AC-014/AC-015)
- **Files:** verify within `e2e/AC-010-server-side-authz.spec.ts` / `smoke.spec.ts` (add an unauth case if not
  already present): unauthenticated `GET /dashboard` → redirected to `/login?callbackUrl=/dashboard`, no protected
  content; `/`, `/login`, `/signup`, `/cafe/guest` render without redirect.
- **Verify:** `pnpm e2e`
- **AC:** AC-014 (e2e), AC-015 (cross-stack reference; AC-015 owning layer is unit per Task 3.7 — the e2e is a
  corroboration, not the owner).

---

## Phase 6 — Cutover: swap CI, delete Prisma + NextAuth (tree green throughout)

### Task 6.1 — Swap CI to the Supabase local stack + drizzle migrations
- **Files:** edit `.github/workflows/ci.yml`.
- **Change:** in both jobs, replace the bare `postgres:16` service + `pnpm db:deploy` with: install the Supabase
  CLI, `supabase start` (boots Postgres+Auth+Storage+Realtime), set `DATABASE_URL`/`TEST_DATABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_URL`/keys from `supabase status -o env`, then `pnpm dz:migrate` +
  `psql -f supabase/migrations/*.sql` (RLS/Storage/auth-link) + `pnpm tsx scripts/seed.ts`. Replace
  `pnpm db:generate` with `pnpm dz:generate --check` (or drop — schema is committed). Remove `NEXTAUTH_SECRET`/
  `NEXTAUTH_URL`/`AUTH_TRUST_HOST` env (no NextAuth). The `quality` job still runs typecheck/lint/test:unit/
  test:int/build; `e2e` job still builds + runs Playwright against the seeded stack.
- **Verify:** push branch → CI green (or locally: `act` / replicate the steps).
- **AC:** all (CI is the gate that re-proves the full suite on the new stack).

### Task 6.2 — Delete NextAuth surface
- **Files:** delete `lib/auth.ts`, `lib/auth.config.ts`, `lib/auth.config.test.ts`,
  `app/api/auth/[...nextauth]/route.ts`, `lib/auth/authorize.ts`, `lib/auth/authorize.test.ts`.
- **Change:** remove `next-auth` from `package.json`. The AC-003 timing/enumeration logic in `authorize.ts` is
  superseded by Supabase Auth (ADR-0014) + the login component's generic-error normalisation (Task 3.5, unit AC-003)
  + Supabase's opaque `Invalid login credentials`. AC-014's "no-token → deny" is now proven by the middleware
  `getUser()` null path (e2e Task 5.2) — the old `authorize.test.ts` AC-014 case is removed (it tested the
  NextAuth Credentials provider that no longer exists).
- **Verify:** `pnpm typecheck && pnpm test` (no dangling imports; AC-003/AC-014 owners green per the table).
- **AC:** AC-003 (now unit, Task 3.5), AC-014 (now e2e, Task 5.2) — re-homed, not lost.

### Task 6.3 — Delete Prisma surface; move seed
- **Files:** delete `prisma/schema.prisma`, `prisma/migrations/*`, `prisma/seed.ts`, `lib/db/client.ts`; remove the
  `prisma` config block + `postinstall: prisma generate` + `@prisma/client`/`prisma`/`@types/bcryptjs`/`bcryptjs`
  from `package.json`; rename `db:*` scripts: `db:migrate`→`dz:migrate` wrapper that also applies
  `supabase/migrations`, `db:deploy`→drizzle migrate + supabase push, `db:seed`→`tsx scripts/seed.ts`,
  `db:studio`→`dz:studio`. Move the int-test `vitest.setup.int.ts` default URL (already done Task 2.4).
- **Verify:** `pnpm install && pnpm typecheck && pnpm lint:ci && pnpm test && pnpm build`
- **AC:** all (full suite green with zero Prisma/NextAuth code).

### Task 6.4 — Update `docs/environments.md` for the Supabase local stack
- **Files:** edit `docs/environments.md`.
- **Change:** replace the Registry rows (Neon dev/preview/prod) with: **local** = Supabase CLI local stack
  (`supabase start`) for dev + unit/integration/e2e; **preview/prod** = a Supabase project (cloud or self-hosted —
  deferred infra decision per ADR-0013, owner-gated). Replace the "Neon specifics" + Docker-Postgres quickstart
  with a Supabase quickstart (`supabase start`, copy keys from `supabase status`, `pnpm dz:migrate`,
  `psql -f supabase/migrations/*`, `pnpm db:seed`). Keep the reversible-migration + secrets-never-committed +
  prod-owner-gated rules; update secret names (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_*` — drop `NEXTAUTH_SECRET`/`DIRECT_URL`).
- **Verify:** `grep -q "supabase start" docs/environments.md && ! grep -q "NEXTAUTH_SECRET" docs/environments.md && echo OK`
- **AC:** none (docs).

---

## Traceability — preserved I-004 AC × owning layer on the new stack

| AC | I-004 owning layer | New owning test (this plan) | Layer (new) | Changed? |
|----|--------------------|-----------------------------|-------------|----------|
| AC-001 (roleHome routing) | Unit | `lib/auth/route-policy.test.ts` (enum import re-pointed) | Unit | layer same |
| AC-002 (admin login → /admin) | E2E | `e2e/AC-002-admin-login.spec.ts` (Supabase login) | E2E | layer same |
| AC-003 (no enumeration, generic error) | E2E→**Unit** | `app/(public)/login/__tests__/login-page.test.tsx` | Unit | **moved down** (Supabase opaque error + component normalisation; was partly NextAuth) |
| AC-004 (signup creates MEMBER + hash) | Integration | `app/(public)/signup/actions.int.test.ts` (authUserId, no hash) | Integration | layer same; assertion updated |
| AC-005 (duplicate rejected) | E2E | `app/(public)/signup/actions.int.test.ts` (ref) + e2e signup | E2E | layer same |
| AC-010 (member blocked /admin, content-absent) | E2E | `e2e/AC-010-server-side-authz.spec.ts` | E2E | layer same (session read swapped) |
| AC-011 (member blocked /barista) | E2E | `e2e/AC-010-server-side-authz.spec.ts` | E2E | layer same |
| AC-012 (admin reaches /admin) | Unit | `lib/auth/route-policy.test.ts` | Unit | layer same |
| AC-013 (barista/admin reach /barista) | Unit | `lib/auth/route-policy.test.ts` | Unit | layer same |
| AC-014 (unauth → /login?callbackUrl) | E2E | `e2e/...authz.spec.ts` (middleware getUser null path) | E2E | layer same (re-homed off authorize.ts) |
| AC-015 (public paths open) | Unit | `lib/auth/route-policy.test.ts` (+ e2e corroboration) | Unit | layer same |
| AC-020 (session carries role+orgId) | Unit | `lib/auth/session-claims.test.ts` | Unit | layer same (callbacks → mapper) |
| AC-021 (org_id-scoped reads) | Integration | `lib/db/users.int.test.ts` (authoritative) + `lib/db/rls.int.test.ts` (backstop) | Integration | layer same; **+RLS backstop** |
| AC-022 (`can()` UX-only) | Unit | `lib/auth/policy.test.ts` | Unit | layer same |
| AC-023 (no plaintext password) | Integration | `lib/db/users.int.test.ts` (no password column at all) | Integration | layer same; **strengthened** |

Pyramid preserved: AC-001/012/013/015/020/022 + AC-003 = **unit**; AC-004/005(ref)/021/023 + RLS/Realtime/Storage
smokes = **integration**; AC-002/010/011/014 = **e2e** (≤4 curated journeys). One owning layer per AC; the RLS,
Realtime, and Storage tests are *new backstop/seam* tests, not AC owners.

## Cutover order (tree green at each boundary)
1. **Phase 0–1** — Supabase local + Drizzle schema/client stood up **alongside** Prisma/NextAuth. Nothing wired to
   them yet → existing suite still green.
2. **Phase 2** — data layer ported to Drizzle; `users.int.test.ts` + signup int test green on the Supabase DB.
   Prisma still present (auth still NextAuth) → green.
3. **Phase 3** — auth ported to Supabase Auth (session shape preserved); unit auth tests green; app builds.
4. **Phase 4** — RLS + Realtime/Storage seams added (additive; new int tests green).
5. **Phase 5** — e2e re-proven on the new stack (AC-002/010/011/014).
6. **Phase 6** — CI swapped, then Prisma + NextAuth deleted **last**, with a full `pnpm test && pnpm build` gate.

## Out of scope (deferred — own ADR/issue each)
Cafe/booking/print/transaction domains (cafe rebuilds on this foundation after I-005), payments gateway, on-prem
agent, ESB/ERP connectors, OAuth/phone-OTP/password-reset/MFA, production email-confirmation flow, the
cloud-vs-self-host + Indonesia data-residency call, edge JWT local-verify optimisation (OQ-A follow-up).
