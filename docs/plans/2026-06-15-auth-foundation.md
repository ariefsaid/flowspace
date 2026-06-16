# Plan — I-004 Auth + data foundation (2026-06-15)

Spec: `docs/specs/0002-auth-foundation.spec.md` · ADRs: `0003` (NextAuth credentials), `0004` (server-side authz).
Stack: Next.js 15 App Router, NextAuth v5, Prisma + Postgres (Neon), Vitest (unit + Prisma integration), Playwright.

## How to read this plan
- Tasks are 2–5 min, ordered. Each behavior task is **TDD**: write the failing test first (RED), then the
  implementation (GREEN). Verify command is exact. No "TBD"/"similar to".
- `pnpm` at repo root. Integration tests require a throwaway Postgres (see Task 0 / ADR-0004 / `environments.md`).
- Type contract (every task obeys these signatures):
  ```ts
  // prisma enums (generated): Role = "MEMBER" | "ADMIN" | "BARISTA"
  //                           MembershipTier = "REGULAR" | "PREMIUM" | "GOLD"
  type SessionUser = { id: string; email: string; name: string | null; role: Role; orgId: string };
  // lib/db/users.ts
  findByEmail(email: string): Promise<AppUser | null>            // login only — not org-scoped (email is global-unique)
  findById(orgId: string, id: string): Promise<AppUser | null>  // org-scoped read
  listByOrg(orgId: string): Promise<AppUser[]>                   // org-scoped read
  createMember(input: { orgId: string; email: string; name: string; passwordHash: string }): Promise<AppUser>
  // lib/auth/policy.ts
  can(action: "access", entity: "admin" | "barista", ctx: { role: Role }): boolean
  // lib/auth/route-policy.ts
  requiredRolesFor(pathname: string): Role[] | "public"   // [] = any authed; "public" = no auth
  roleHome(role: Role): "/admin" | "/barista" | "/dashboard"
  ```

---

## Phase 0 — Dependencies & test infrastructure

### Task 0.1 — Add bcryptjs
- File: `package.json`. Run: `pnpm add bcryptjs && pnpm add -D @types/bcryptjs`.
- Verify: `node -e "require('bcryptjs')" && pnpm typecheck` exits 0.

### Task 0.2 — Add a node-env Vitest project for Prisma integration tests
- The current `vitest.config.ts` is jsdom-only. Prisma integration tests need the **node** environment and must be
  isolated from unit runs. Edit `vitest.config.ts` to use projects:
  ```ts
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", environment: "jsdom", setupFiles: ["./vitest.setup.ts"],
                 include: ["**/*.{test,spec}.{ts,tsx}"],
                 exclude: ["**/node_modules/**", "**/.next/**", "e2e/**", "**/*.int.test.ts"] },
      },
      {
        extends: true,
        test: { name: "integration", environment: "node",
                 include: ["**/*.int.test.ts"], exclude: ["**/node_modules/**", "**/.next/**"] },
      },
    ],
  }
  ```
  Keep the existing `resolve.alias` and `coverage` blocks at the top level.
- Add scripts to `package.json`: `"test:int": "vitest run --project integration"`,
  `"test:unit": "vitest run --project unit"`.
- Verify: `pnpm test:unit` runs the existing `lib/__tests__/brand.test.ts` green; `pnpm test:int` runs 0 tests (no
  `*.int.test.ts` yet) and exits 0.

### Task 0.3 — Document the test-DB env in `.env.example`
- Append placeholders to `.env.example` (placeholders only — never real secrets):
  ```
  # Integration tests (throwaway Postgres — local Docker or a Neon test branch; see docs/environments.md)
  TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flowspace_test?schema=public"
  # NextAuth
  NEXTAUTH_SECRET="dev-only-change-me"
  AUTH_SECRET="dev-only-change-me"
  # Seed (dev-only fallbacks; set real values in your local .env, never commit)
  SEED_ORG_SLUG="flowspace"
  SEED_ADMIN_EMAIL="admin@flowspace.test"
  SEED_ADMIN_PASSWORD="dev-admin-pw"
  SEED_MEMBER_EMAIL="budi@flowspace.test"
  SEED_MEMBER_PASSWORD="dev-member-pw"
  SEED_BARISTA_EMAIL="barista@flowspace.test"
  SEED_BARISTA_PASSWORD="dev-barista-pw"
  ```
- Verify: `grep -q TEST_DATABASE_URL .env.example && grep -q SEED_ADMIN_EMAIL .env.example`.

---

## Phase 1 — Data model (Prisma) + migration + seed

### Task 1.1 — Finalize `Organization` + `AppUser` schema with enums
- File: `prisma/schema.prisma`. Replace the `AppUser` model and add enums (keep `Organization` as-is plus no change
  needed beyond the existing relation):
  ```prisma
  enum Role {
    MEMBER
    ADMIN
    BARISTA
  }

  enum MembershipTier {
    REGULAR
    PREMIUM
    GOLD
  }

  model AppUser {
    id             String         @id @default(cuid())
    orgId          String         @map("org_id")
    email          String         @unique
    name           String
    passwordHash   String         @map("password_hash")
    role           Role           @default(MEMBER)
    membershipTier MembershipTier @default(REGULAR) @map("membership_tier")
    timeCredits    Int            @default(0) @map("time_credits")
    printBalance   Int            @default(0) @map("print_balance")
    createdAt      DateTime       @default(now()) @map("created_at")
    updatedAt      DateTime       @updatedAt @map("updated_at")
    archivedAt     DateTime?      @map("archived_at")

    organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

    @@index([orgId])
    @@map("app_users")
  }
  ```
  (Realizes FR-021. `email` stays global-unique for the single-venue MVP; a future multi-venue ADR moves it to
  `@@unique([orgId, email])` — noted as a follow-up.)
- Verify: `pnpm exec prisma validate` prints "The schema ... is valid".

### Task 1.2 — Create the first reversible migration
- Run against a throwaway DB (local Docker per `docs/environments.md`):
  `pnpm db:migrate --name auth_foundation`.
- This writes `prisma/migrations/<ts>_auth_foundation/migration.sql` and regenerates the client.
- Verify: `ls prisma/migrations | grep auth_foundation` and the SQL contains
  `CREATE TYPE "Role"`, `CREATE TYPE "MembershipTier"`, `password_hash`, `archived_at`, and
  `CREATE INDEX "app_users_org_id_idx"`. Reversibility: `pnpm exec prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-empty --script` produces valid down SQL (sanity only; no down-migration files in Prisma).

### Task 1.3 — Seed: one org + admin/member/barista (FR-022)
- File: `prisma/seed.ts` (new). Use `bcryptjs` and env passwords with dev fallbacks:
  ```ts
  import { PrismaClient, Role, MembershipTier } from "@prisma/client";
  import bcrypt from "bcryptjs";

  const prisma = new PrismaClient();
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  async function main() {
    const slug = process.env.SEED_ORG_SLUG ?? "flowspace";
    const org = await prisma.organization.upsert({
      where: { slug }, update: {}, create: { name: "FlowSpace", slug },
    });
    const users = [
      { key: "ADMIN", email: process.env.SEED_ADMIN_EMAIL ?? "admin@flowspace.test",
        name: "Admin", role: Role.ADMIN, tier: MembershipTier.REGULAR, credits: 0, print: 0,
        pw: process.env.SEED_ADMIN_PASSWORD ?? "dev-admin-pw" },
      { key: "MEMBER", email: process.env.SEED_MEMBER_EMAIL ?? "budi@flowspace.test",
        name: "Budi Santoso", role: Role.MEMBER, tier: MembershipTier.PREMIUM, credits: 139, print: 68,
        pw: process.env.SEED_MEMBER_PASSWORD ?? "dev-member-pw" },
      { key: "BARISTA", email: process.env.SEED_BARISTA_EMAIL ?? "barista@flowspace.test",
        name: "Barista", role: Role.BARISTA, tier: MembershipTier.REGULAR, credits: 0, print: 0,
        pw: process.env.SEED_BARISTA_PASSWORD ?? "dev-barista-pw" },
    ];
    for (const u of users) {
      await prisma.appUser.upsert({
        where: { email: u.email }, update: {},
        create: { orgId: org.id, email: u.email, name: u.name, passwordHash: hash(u.pw),
                  role: u.role, membershipTier: u.tier, timeCredits: u.credits, printBalance: u.print },
      });
    }
  }
  main().finally(() => prisma.$disconnect());
  ```
  (Member Budi: PREMIUM, 139 credits, 68 print — matches `OBS-056` / the dashboard mock.)
- Add to `package.json`: `"db:seed": "tsx prisma/seed.ts"` and the Prisma `"prisma": { "seed": "tsx prisma/seed.ts" }` block; `pnpm add -D tsx`.
- Verify: `pnpm db:seed` then `pnpm exec prisma studio` shows 1 org + 3 users; or
  `pnpm exec tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.appUser.count().then(c=>{console.log(c); return p.\$disconnect()})"` prints `3`.

---

## Phase 2 — Repository seam (`lib/db/users.ts`) — TDD

### Task 2.1 (RED) — Integration test: `findByEmail` + `org_id` scoping + no plaintext
- File: `lib/db/users.int.test.ts` (new, node env, runs against `TEST_DATABASE_URL`). Write a helper that points a
  fresh `PrismaClient` at `process.env.TEST_DATABASE_URL`, runs `prisma migrate deploy` once (or a `beforeAll`
  truncate), seeds two orgs A and B each with a user, then:
  - `it("AC-021: listByOrg returns only the caller org's users", …)` — seed `a@x.test` in org A and `b@x.test` in
    org B; assert `listByOrg(orgA.id)` contains A's user and **not** B's; assert `findById(orgA.id, bUser.id)` is
    `null` (cross-org id lookup denied).
  - `it("AC-023: created user stores a bcrypt hash, never plaintext", …)` — `createMember(...)`, then read the row
    and assert `passwordHash` starts with `$2` (bcrypt) and `!== "plaintext"`, and that the `AppUser` type has no
    `password` field.
- Verify (RED): `pnpm test:int` fails because `lib/db/users.ts` does not yet export these functions.

### Task 2.2 (GREEN) — Implement `lib/db/users.ts`
- File: `lib/db/users.ts` (new):
  ```ts
  import { prisma } from "@/lib/db/client";
  import type { AppUser } from "@prisma/client";

  /** Login lookup. Email is globally unique (single-venue MVP); not org-scoped. */
  export function findByEmail(email: string): Promise<AppUser | null> {
    return prisma.appUser.findUnique({ where: { email } });
  }

  /** Org-scoped read by id — returns null for a row outside the caller's org. */
  export function findById(orgId: string, id: string): Promise<AppUser | null> {
    return prisma.appUser.findFirst({ where: { id, orgId, archivedAt: null } });
  }

  /** Org-scoped directory of active users. */
  export function listByOrg(orgId: string): Promise<AppUser[]> {
    return prisma.appUser.findMany({ where: { orgId, archivedAt: null }, orderBy: { name: "asc" } });
  }

  /** Signup path: creates a MEMBER in the given org. Caller hashes the password. */
  export function createMember(input: {
    orgId: string; email: string; name: string; passwordHash: string;
  }): Promise<AppUser> {
    return prisma.appUser.create({
      data: { orgId: input.orgId, email: input.email, name: input.name,
              passwordHash: input.passwordHash, role: "MEMBER" },
    });
  }
  ```
- Verify (GREEN): `pnpm test:int` passes AC-021 + AC-023; `pnpm typecheck` 0 errors.

---

## Phase 3 — `can()` policy + route-policy table — TDD (unit)

### Task 3.1 (RED) — Unit test for `can()` (AC-022)
- File: `lib/auth/policy.test.ts` (new):
  ```ts
  import { describe, expect, it } from "vitest";
  import { can } from "@/lib/auth/policy";
  describe("can() UX policy", () => {
    it("AC-022: only ADMIN can access admin", () => {
      expect(can("access", "admin", { role: "ADMIN" })).toBe(true);
      expect(can("access", "admin", { role: "MEMBER" })).toBe(false);
      expect(can("access", "admin", { role: "BARISTA" })).toBe(false);
    });
    it("AC-022: ADMIN and BARISTA can access barista", () => {
      expect(can("access", "barista", { role: "BARISTA" })).toBe(true);
      expect(can("access", "barista", { role: "ADMIN" })).toBe(true);
      expect(can("access", "barista", { role: "MEMBER" })).toBe(false);
    });
  });
  ```
- Verify (RED): `pnpm test:unit` fails (no `lib/auth/policy.ts`).

### Task 3.2 (GREEN) — Implement `lib/auth/policy.ts`
- File: `lib/auth/policy.ts` (new):
  ```ts
  import type { Role } from "@prisma/client";

  /**
   * UX-ONLY authorization helper. NOT the security boundary — the server
   * middleware (middleware.ts) and the org_id-scoped repository (lib/db/*) are
   * authoritative (ADR-0004). Use this only to show/hide affordances.
   */
  export function can(
    action: "access",
    entity: "admin" | "barista",
    ctx: { role: Role },
  ): boolean {
    if (entity === "admin") return ctx.role === "ADMIN";
    return ctx.role === "ADMIN" || ctx.role === "BARISTA";
  }
  ```
- Verify (GREEN): `pnpm test:unit` passes AC-022.

### Task 3.3 (RED) — Unit test for the route-policy table
- File: `lib/auth/route-policy.test.ts` (new):
  ```ts
  import { describe, expect, it } from "vitest";
  import { requiredRolesFor, roleHome } from "@/lib/auth/route-policy";
  describe("route policy", () => {
    it("public paths need no auth", () => {
      for (const p of ["/", "/login", "/signup", "/cafe/guest"]) expect(requiredRolesFor(p)).toBe("public");
    });
    it("admin paths require ADMIN", () => {
      expect(requiredRolesFor("/admin")).toEqual(["ADMIN"]);
      expect(requiredRolesFor("/admin/users")).toEqual(["ADMIN"]);
    });
    it("barista requires BARISTA or ADMIN", () => {
      expect(requiredRolesFor("/barista")).toEqual(["BARISTA", "ADMIN"]);
    });
    it("member paths require any authed user", () => {
      expect(requiredRolesFor("/dashboard")).toEqual([]);
    });
    it("roleHome maps each role", () => {
      expect(roleHome("ADMIN")).toBe("/admin");
      expect(roleHome("BARISTA")).toBe("/barista");
      expect(roleHome("MEMBER")).toBe("/dashboard");
    });
  });
  ```
- Verify (RED): `pnpm test:unit` fails (no module).

### Task 3.4 (GREEN) — Implement `lib/auth/route-policy.ts`
- File: `lib/auth/route-policy.ts` (new):
  ```ts
  import type { Role } from "@prisma/client";

  const PUBLIC = ["/", "/login", "/signup", "/cafe/guest"];
  const MEMBER_PREFIXES = ["/dashboard", "/booking", "/cafe", "/print", "/keycard", "/topup", "/history"];

  /** "public" = no auth; [] = any authed user; [roles] = one of these roles. */
  export function requiredRolesFor(pathname: string): Role[] | "public" {
    if (pathname === "/cafe/guest") return "public";          // before /cafe member prefix
    if (PUBLIC.includes(pathname)) return "public";
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return ["ADMIN"];
    if (pathname === "/barista") return ["BARISTA", "ADMIN"];
    if (MEMBER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return [];
    return [];   // fail closed: unknown app path requires at least authentication
  }

  export function roleHome(role: Role): "/admin" | "/barista" | "/dashboard" {
    if (role === "ADMIN") return "/admin";
    if (role === "BARISTA") return "/barista";
    return "/dashboard";
  }
  ```
- Verify (GREEN): `pnpm test:unit` passes the route-policy suite.

---

## Phase 4 — NextAuth v5 wiring (config split per ADR-0003) — TDD on callbacks

### Task 4.1 — NextAuth type augmentation
- File: `types/next-auth.d.ts` (new):
  ```ts
  import type { Role } from "@prisma/client";
  import type { DefaultSession } from "next-auth";

  declare module "next-auth" {
    interface Session { user: { id: string; role: Role; orgId: string } & DefaultSession["user"]; }
    interface User { id?: string; role: Role; orgId: string; }
  }
  declare module "next-auth/jwt" {
    interface JWT { role: Role; orgId: string; }
  }
  ```
- Verify: `pnpm typecheck` 0 errors.

### Task 4.2 (RED) — Unit test for jwt/session callbacks (AC-020)
- File: `lib/auth.config.test.ts` (new). Import the `callbacks` from `lib/auth.config.ts` and assert:
  ```ts
  it("AC-020: jwt copies role+orgId from user on sign-in", async () => {
    const token = await authConfig.callbacks!.jwt!({
      token: { sub: "u1" } as any,
      user: { id: "u1", role: "ADMIN", orgId: "org1", email: "a@b.c" } as any,
    } as any);
    expect(token.role).toBe("ADMIN"); expect(token.orgId).toBe("org1"); expect(token.sub).toBe("u1");
  });
  it("AC-020: session exposes id/role/orgId from token", async () => {
    const session = await authConfig.callbacks!.session!({
      session: { user: {} } as any,
      token: { sub: "u1", role: "MEMBER", orgId: "org1" } as any,
    } as any);
    expect(session.user.id).toBe("u1"); expect(session.user.role).toBe("MEMBER"); expect(session.user.orgId).toBe("org1");
  });
  ```
- Verify (RED): `pnpm test:unit` fails (no `lib/auth.config.ts`).

### Task 4.3 (GREEN) — `lib/auth.config.ts` (Edge-safe; no Prisma/bcrypt)
- File: `lib/auth.config.ts` (new):
  ```ts
  import type { NextAuthConfig } from "next-auth";
  import { requiredRolesFor, roleHome } from "@/lib/auth/route-policy";
  import type { Role } from "@prisma/client";

  export const authConfig: NextAuthConfig = {
    session: { strategy: "jwt" },
    pages: { signIn: "/login" },
    providers: [], // the Credentials provider is added in lib/auth.ts (Node runtime)
    callbacks: {
      jwt({ token, user }) {
        if (user) { token.sub = user.id ?? token.sub; token.role = user.role; token.orgId = user.orgId; }
        return token;
      },
      session({ session, token }) {
        if (session.user) {
          session.user.id = token.sub as string;
          session.user.role = token.role as Role;
          session.user.orgId = token.orgId as string;
        }
        return session;
      },
      authorized({ auth, request }) {
        const required = requiredRolesFor(request.nextUrl.pathname);
        if (required === "public") return true;
        const role = auth?.user?.role as Role | undefined;
        if (!role) return false;                         // → redirect to signIn page
        if (required.length === 0) return true;          // any authed user
        if (required.includes(role)) return true;
        return Response.redirect(new URL(roleHome(role), request.nextUrl)); // deny → role home
      },
    },
  };
  ```
- Verify (GREEN): `pnpm test:unit` passes AC-020.

### Task 4.4 (GREEN) — `lib/auth.ts` (Node runtime; Credentials + Prisma + bcrypt)
- File: `lib/auth.ts` (replace the placeholder):
  ```ts
  import NextAuth from "next-auth";
  import Credentials from "next-auth/providers/credentials";
  import bcrypt from "bcryptjs";
  import { authConfig } from "@/lib/auth.config";
  import { findByEmail } from "@/lib/db/users";

  export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
      Credentials({
        credentials: { email: {}, password: {} },
        async authorize(creds) {
          const email = String(creds?.email ?? "").toLowerCase().trim();
          const password = String(creds?.password ?? "");
          if (!email || !password) return null;
          const user = await findByEmail(email);
          if (!user || user.archivedAt) return null;
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return null;
          return { id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.orgId };
        },
      }),
    ],
  });
  ```
- Verify: `pnpm typecheck` 0 errors. (Behavior proven by AC-001/003 e2e in Phase 7.)

### Task 4.5 (GREEN) — Auth route handler
- File: `app/api/auth/[...nextauth]/route.ts` (new):
  ```ts
  import { handlers } from "@/lib/auth";
  export const { GET, POST } = handlers;
  ```
- Verify: `pnpm build` compiles the route (no error).

---

## Phase 5 — Middleware (server-side gate) per ADR-0004

### Task 5.1 — `middleware.ts` at repo root
- File: `middleware.ts` (new):
  ```ts
  import NextAuth from "next-auth";
  import { authConfig } from "@/lib/auth.config";

  export const { auth: middleware } = NextAuth(authConfig);
  export default middleware((req) => {
    // authz handled by authConfig.callbacks.authorized (route-policy table).
    void req;
  });

  export const config = {
    matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp)$).*)"],
  };
  ```
  (The `authorized` callback in `authConfig` does all role logic — one source of truth. Edge-safe: imports only
  `lib/auth.config.ts` + `route-policy.ts`, no Prisma/bcrypt — ADR-0003.)
- Verify: `pnpm build` succeeds (Edge middleware bundle does not pull Prisma — if it does, the build fails here,
  catching an accidental Prisma import).

### Task 5.2 — Session helper for server reads
- File: `lib/auth/session.ts` (new):
  ```ts
  import { auth } from "@/lib/auth";

  /** Server-side: the trusted session user, or null. */
  export async function getSessionUser() {
    const session = await auth();
    return session?.user ?? null;
  }

  /** Server-side: throws if unauthenticated. Use in route handlers / server actions. */
  export async function requireSession() {
    const user = await getSessionUser();
    if (!user) throw new Error("UNAUTHENTICATED");
    return user; // { id, role, orgId, email, name }
  }
  ```
- Verify: `pnpm typecheck` 0 errors.

---

## Phase 6 — Wire login/signup to real auth

### Task 6.1 — Signup server action
- File: `app/(public)/signup/actions.ts` (new):
  ```ts
  "use server";
  import bcrypt from "bcryptjs";
  import { prisma } from "@/lib/db/client";
  import { findByEmail, createMember } from "@/lib/db/users";

  export async function signupAction(input: { name: string; email: string; password: string }) {
    const email = input.email.toLowerCase().trim();
    if (input.password.length < 6) return { error: "Kata sandi minimal 6 karakter." };
    if (await findByEmail(email)) return { error: "Email sudah terdaftar." };       // FR-005 / AC-005
    const slug = process.env.SEED_ORG_SLUG ?? "flowspace";
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const passwordHash = await bcrypt.hash(input.password, 10);                       // NFR-001
    await createMember({ orgId: org.id, email, name: input.name.trim(), passwordHash });
    return { ok: true };
  }
  ```
- Verify: `pnpm typecheck` 0 errors. (AC-004/AC-005 behavior owned by integration/e2e below.)

### Task 6.2 — Wire `/login` to `signIn`
- File: `app/(public)/login/page.tsx`. Replace the `handleSubmit` stub: call NextAuth client `signIn("credentials",
  { email, password, redirect: false })`; on `result?.error` set a generic error state rendered above the form
  ("Email atau kata sandi salah."); on success `router.push(result.url ?? "/dashboard")` — but prefer letting the
  server route by role: call `signIn("credentials", { email, password, callbackUrl: "/dashboard" })` and let the
  middleware redirect a non-member to their home (FR-003). Keep all existing markup/labels (no UI change).
  Import: `import { signIn } from "next-auth/react";`.
- Verify: `pnpm typecheck` + `pnpm lint:ci` 0 errors. (Behavior: AC-001/002/003 e2e.)

### Task 6.3 — Wire `/signup` to the action then `signIn`
- File: `app/(public)/signup/page.tsx`. Replace `handleSubmit`: client-side check `password === confirmPassword`
  (else set error "Konfirmasi kata sandi tidak cocok."); call `signupAction({ name, email, password })`; on
  `res.error` show it; on `res.ok` call `signIn("credentials", { email, password, callbackUrl: "/dashboard" })`.
  Keep all existing markup. Import the action + `signIn` from `next-auth/react`.
- Verify: `pnpm typecheck` + `pnpm lint:ci` 0 errors.

### Task 6.4 — Make headers' "Keluar" a real sign-out + drop the mock identity
- Files: `components/layout/MemberHeader.tsx`, `components/layout/AdminHeader.tsx`. Replace the `Link href="/login"`
  logout with a button calling `signOut({ callbackUrl: "/login" })` (`import { signOut } from "next-auth/react"`).
  Replace `currentMember.name` with the session name via `useSession()` (wrap the app in `SessionProvider` —
  Task 6.5). Keep markup/styles identical.
- Verify: `pnpm typecheck` + `pnpm lint:ci` 0 errors; `pnpm build` green.

### Task 6.5 — SessionProvider
- File: `app/layout.tsx`. Wrap `{children}` in a client `SessionProvider`. Create
  `components/providers/SessionProvider.tsx` (`"use client"; export { SessionProvider } from "next-auth/react";`)
  and use it in the root layout.
- Verify: `pnpm build` green; `pnpm typecheck` 0 errors.

---

## Phase 7 — Acceptance: integration + e2e

### Task 7.1 (RED→GREEN) — Integration test: signup creates a MEMBER (AC-004)
- File: `app/(public)/signup/actions.int.test.ts` (new, node env). Against `TEST_DATABASE_URL`: seed the org,
  call `signupAction({ name, email: "new@x.test", password: "secret6" })`, then assert via `findByEmail` the row
  has `role === "MEMBER"`, `orgId === org.id`, `passwordHash` starts with `$2`, and `bcrypt.compare("secret6",
  hash)` is true. Title: `it("AC-004: signup creates a MEMBER with a bcrypt hash", …)`. Add a second
  `it("AC-005: duplicate email is rejected", …)` asserting the second call returns `{ error: ... }` and count stays 1.
- Verify: `pnpm test:int` passes AC-004 + AC-005.

### Task 7.2 — Enable Playwright webServer + seeded test DB
- File: `playwright.config.ts`. Uncomment/enable `webServer` (`command: "pnpm build && pnpm start"` or `pnpm dev`,
  `url: http://localhost:3000`, `reuseExistingServer: !process.env.CI`). Document that e2e runs need the DB
  migrated + seeded (`pnpm db:deploy && pnpm db:seed` against the e2e DB) and `NEXTAUTH_SECRET` set.
- Verify: `pnpm exec playwright test e2e/smoke.spec.ts` still green (smoke is server-independent).

### Task 7.3 — E2E: login routes by role + bad creds (AC-001, AC-002, AC-003)
- File: `e2e/AC-001-login-role-routing.spec.ts` (new). Three tests, AC-id as leading token of each `test(...)`:
  - `test("AC-001 member login lands on /dashboard", …)` — fill seeded member creds, submit, expect URL `/dashboard`
    and a member-nav element visible.
  - `test("AC-002 admin login lands on /admin", …)` — seeded admin creds → expect `/admin`.
  - `test("AC-003 bad credentials show a generic error and stay on /login", …)` — wrong password → expect still on
    `/login` and the generic error text "Email atau kata sandi salah." visible; assert the **same** text appears for
    an unknown email (no enumeration).
- Verify: `pnpm e2e e2e/AC-001-login-role-routing.spec.ts` green (with the app + seeded DB up).

### Task 7.4 — E2E: the security ACs — member blocked, admin/barista allowed, unauth redirect (AC-010..AC-015)
- File: `e2e/AC-010-server-side-authz.spec.ts` (new). AC-id leading token per test:
  - `test("AC-010 member is blocked server-side from /admin and /admin/users", …)` — log in as member, `goto("/admin")`
    → expect redirected to `/dashboard` and **no** admin-only heading present; repeat for `/admin/users`.
  - `test("AC-011 member is blocked server-side from /barista", …)` — member → `/barista` → redirected to `/dashboard`.
  - `test("AC-012 admin reaches /admin", …)` — admin → `/admin` renders, no redirect.
  - `test("AC-013 barista reaches /barista (and admin too)", …)` — barista → `/barista` renders; admin → `/barista` renders.
  - `test("AC-014 unauthenticated visitor is redirected to /login", …)` — no session, `goto("/dashboard")` → URL is
    `/login` with `callbackUrl=%2Fdashboard`.
  - `test("AC-015 public paths stay open", …)` — no session, `/`, `/login`, `/signup`, `/cafe/guest` all render 200, no redirect.
- These prove the `OBS-122`/`OBS-131` fix end-to-end (middleware short-circuits before render).
- Verify: `pnpm e2e e2e/AC-010-server-side-authz.spec.ts` green.

---

## Phase 8 — Gates

### Task 8.1 — Full green
- Verify, in order: `pnpm typecheck` (0) · `pnpm lint:ci` (0) · `pnpm test:unit` (green, ≥80% lines on changed
  `lib/auth/*`, `lib/db/users.ts`) · `pnpm test:int` (green) · `pnpm build` (green) · `pnpm e2e` (curated specs green).

### Task 8.2 — Masking check
- Verify no client brand / `PERADI_*` leaked into anything written this issue:
  `! grep -rn "PERADI" docs/specs/0002-auth-foundation.spec.ts docs/plans/2026-06-15-auth-foundation.md prisma lib/auth lib/db/users.ts`
  (the spec only *names* `PERADI_*` inside the masking note about the pre-existing mock — acceptable as a flag, not new code).

---

## Traceability table (AC → owning layer → test file)

> Rebalanced to ADR-0010 pyramid (2026-06-16): AC-001/003/012/013/014/015 moved
> down to unit (their canonical proof is on logic functions; e2e reserved for
> genuine cross-stack-only guarantees).

| AC | Requirement | Owning layer | Test (title token / file) | Task |
|----|-------------|--------------|----------------------------|------|
| AC-001 | FR-001, FR-003 | **Unit** | `AC-001` · `lib/auth/route-policy.test.ts` | 3.3/3.4 |
| AC-002 | FR-001, FR-003 | **E2E** | `AC-002` · `e2e/AC-002-admin-login.spec.ts` | 7.3 |
| AC-003 (auth) | FR-002 | **Unit** | `AC-003 (auth)` · `app/(public)/login/__tests__/login-page.test.tsx` + `lib/auth/authorize.test.ts` | 7.3 |
| AC-004 | FR-004, NFR-001 | Integration | `AC-004` · `app/(public)/signup/actions.int.test.ts` | 7.1 |
| AC-005 | FR-005 | Integration | `AC-005` · same file | 7.1 |
| AC-010 | FR-011 (OBS-131) | **E2E** | `AC-010` · `e2e/AC-010-server-side-authz.spec.ts` | 7.4 |
| AC-011 | FR-012 (OBS-122) | **E2E** | `AC-011` · same file | 7.4 |
| AC-012 | FR-011 | **Unit** | `AC-012` · `lib/auth/route-policy.test.ts` | 3.3/3.4 |
| AC-013 | FR-012 | **Unit** | `AC-013` · `lib/auth/route-policy.test.ts` | 3.3/3.4 |
| AC-014 | FR-010 | **Unit** | `AC-014` · `lib/auth/authorize.test.ts` | 4.4 |
| AC-015 | FR-014 | **Unit** | `AC-015` · `lib/auth/route-policy.test.ts` | 3.3/3.4 |
| AC-020 | FR-001 | Unit | `AC-020` · `lib/auth.config.test.ts` | 4.2 |
| AC-021 | FR-020 | Integration | `AC-021` · `lib/db/users.int.test.ts` | 2.1 |
| AC-022 | FR-030 | Unit | `AC-022` · `lib/auth/policy.test.ts` | 3.1 |
| AC-023 | NFR-001 | Integration | `AC-023` · `lib/db/users.int.test.ts` | 2.1 |

## Open questions (carry from spec — need Director/owner sign-off before/at build)
- OQ-1 bcrypt(js) cost 10 vs argon2id (ADR-0003 picks bcryptjs).
- OQ-2 middleware vs per-layout guards (ADR-0004 picks middleware).
- OQ-3 mask the `PERADI_*` FE mocks now or as a follow-up cleanup issue.
- OQ-4 seed passwords from env with dev-only fallbacks (Task 0.3 / 1.3).
- OQ-5 integration/e2e test DB = local Docker Postgres or Neon test branch; CI provisions a throwaway DB.
