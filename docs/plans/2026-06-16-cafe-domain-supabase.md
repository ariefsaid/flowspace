# Plan — I-022 Cafe domain, re-platformed onto Supabase + Drizzle + Supabase Auth

- **Spec:** `docs/specs/0003-cafe-domain.spec.md` (FR-100..131, OBS, NFR-100/101, AC-100..125, OQ-1..5).
  **Behavior/ACs are canonical; the spec's Prisma/ADR-0001/0003/0004 stack references are SUPERSEDED** by
  ADR-0013 (Supabase), ADR-0014 (Supabase Auth), ADR-0015 (Drizzle + RLS + DDL-authority = `supabase/migrations/`).
- **Carried-over ADRs (unchanged):** `docs/adr/0011-cafe-discount-eligibility-seam.md` (discount dormant),
  `docs/adr/0012-cafe-order-code-generation.md` (6-char base36 `#xxxxxx`, bounded retry).
- **Pyramid:** ADR-0010 (many unit, few integration, one curated e2e).
- **Old plan** `docs/plans/2026-06-16-cafe-domain.md` is the STRUCTURAL reference (Phases A–E) only — its Prisma
  mechanics (`schema.prisma`, `prisma migrate`, `prisma.cafeMenuItem`, `@prisma/client` enums) are NOT copied.

> **Re-platform reality (read before estimating).** The cafe vertical was already built once on Prisma/NextAuth and
> the *artifacts are still on this branch*: `lib/cafe/*` (pure logic + unit tests — green-able), the 5 surface
> components + their `*.test.tsx`, `app/cafe/actions.ts`, `app/barista/actions.ts`,
> `app/(admin)/admin/orders/actions.ts`. After I-005 removed Prisma/Neon/NextAuth, these are **compile-broken** in
> exactly three ways: (1) they `import type { … } from "@prisma/client"` (enum gone); (2) `app/cafe/actions.ts` +
> `app/(public)/cafe/guest/page.tsx` `import { prisma } from "@/lib/db/client"` (singleton gone); (3) they all import
> `@/lib/db/cafe`, **which does not exist yet** (the repo was never ported). This plan ports those three seams to the
> new stack and leaves the pixel-perfect UI untouched (NFR-101). It is mostly *re-pointing + one new Drizzle repo +
> one new migration*, not a greenfield build.

## Discipline (binding)
- **TDD red-green per behavior task.** Write the failing test, run the exact verify command to see it RED, then
  implement to GREEN. eng-planner writes ONLY under `docs/`; every path below is the implementer's target.
- **No placeholders.** Every task has exact file paths, real Drizzle/SQL (not Prisma), and an exact verify command.
- **Security/money-path gate.** Tasks tagged **[SEC]** (schema + RLS, repo org-scoping, server-action authz,
  server-computed totals, guest org resolution) MUST be verified by the Director (Claude) and MUST NOT ship on
  same-family-only review per `docs/pi-delegation.md`.

## Reference implementations to MATCH exactly (do not invent new patterns)
| Concern | Canonical file to mirror |
|---|---|
| Org-scoped Drizzle repo (takes server `orgId`, `and(eq…)`, `isNull(archivedAt)`) | `lib/db/users.ts` |
| Drizzle table style + DDL-authority header + `text()` cuid2 ids + `@map`→snake_case | `lib/db/schema.ts` |
| Enum source (string-literal union + `as const` value array, NOT `@prisma/client`) | `lib/db/enums.ts` |
| Migration DDL/ordering + `current_org()` helper | `supabase/migrations/0000_app_schema.sql`, `0001_auth_link.sql` |
| RLS policy pattern (`GRANT … TO authenticated` + `org_id = current_org()`) | `0002_rls_app_users.sql`, `0004_rls_organizations.sql` |
| Integration harness (dedicated `testSql`/`testDb`, raw `TRUNCATE … RESTART IDENTITY CASCADE`, seed 2 orgs) | `lib/db/users.int.test.ts` |
| Server session (`requireSession`/`getSessionUser` → `{ id, role, orgId, email, name }`) | `lib/auth/session.ts`, `lib/auth/session-claims.ts` |
| Realtime browser client seam | `lib/supabase/client.ts` (`createSupabaseBrowserClient`) |

> **Shared type contract (already exists — only the enum import changes in Task B0).** `lib/cafe/types.ts` already
> defines `OrderLineInput`, `PricedLine`, `OrderTotals`. After B0 it re-exports the four cafe enums from
> `@/lib/db/enums`. All tasks import enums/DTOs from `@/lib/cafe/types` or `@/lib/db/enums` — never `@prisma/client`.

---

## Binding decisions baked into this plan (resolving the spec OQs)
1. **DDL authority = `supabase/migrations/0005_cafe_domain.sql`** (sorts after 0000–0004). Mirror tables added to
   `lib/db/schema.ts` (TS query mirror only). Enums added to `lib/db/enums.ts` + `pgEnum` in schema. (Phase A.)
2. **RLS backstop** org-scoped on all 3 cafe tables, `org_id = current_org()` (Phase A). Server stays authority;
   the service-role/postgres connection used by `lib/db/drizzle.ts` bypasses RLS, so **the guest-order insert works
   server-side unaffected** (guests have no JWT; the server resolves orgId by slug and inserts privileged). (Phase A/D.)
3. **`lib/db/cafe.ts`** rewritten as a Drizzle repo mirroring `lib/db/users.ts` (server `orgId`, never client). (Phase C.)
4. **Server-action authz** re-points to `requireSession`/`getSessionUser` (Supabase). Role + ownership + org gate
   server-side. (Phase D.)
5. **`lib/cafe/*` carry over** — only re-point the `@prisma/client` enum-type imports to `@/lib/db/enums`. (Phase B.)
6. **5 surfaces** keep pixel-identical UI; re-point enum imports + Prisma org lookups. (Phase E.)
7. **Seed** — extend `scripts/seed-supabase.ts` (idempotent Drizzle upsert) with the 16 captured menu items. (Phase A.)
8. **OQ-1** discount DORMANT (ADR-0011). **OQ-2** POS reads live menu, checkout deferred. **OQ-3** 6-char base36
   `#xxxxxx`, bounded retry (ADR-0012). **OQ-5** admin "Hapus" dormant.
9. **OQ-4 / KDS realtime — IN SCOPE** as a separable final phase (Phase F): Supabase Realtime, org-scoped channel,
   manual refresh retained as fallback.

---

## Phase A — Schema: migration + enums + Drizzle mirror + RLS  **[SEC]**

### A0. Add the four cafe enums to the TS enum source — `lib/db/enums.ts`
- **File:** `lib/db/enums.ts` (append; mirror the `ROLES` / `MEMBERSHIP_TIERS` style exactly).
- **Add:**
  ```ts
  export const CAFE_CATEGORIES = ["COFFEE", "NON_COFFEE", "FOOD", "SNACK"] as const;
  export type CafeCategory = (typeof CAFE_CATEGORIES)[number];

  export const CAFE_ORDER_STATUSES = ["NEW", "PREPARING", "READY", "COMPLETED", "CANCELLED"] as const;
  export type CafeOrderStatus = (typeof CAFE_ORDER_STATUSES)[number];

  export const DRINK_TEMPERATURES = ["HOT", "COLD", "ICE_BLENDED"] as const;
  export type DrinkTemperature = (typeof DRINK_TEMPERATURES)[number];

  export const SUGAR_LEVELS = ["NORMAL", "LESS", "NONE"] as const;
  export type SugarLevel = (typeof SUGAR_LEVELS)[number];
  ```
- **Verify:** `pnpm typecheck` (no errors introduced by this file). (FR-100, FR-110, FR-120.)

### A1. Add the cafe tables to the Drizzle TS query mirror — `lib/db/schema.ts`  **[SEC]**
- **File:** `lib/db/schema.ts` (append; mirror `appUsers` style — `text()` cuid2 id via `$defaultFn(() => createId())`,
  `@map`→snake_case column names, `timestamp(precision:3, mode:"date")`, the DDL-authority header note already at top).
- **Add the three `pgEnum`s + three `pgTable`s** (column names MUST match the migration in A2 exactly):
  ```ts
  export const cafeCategoryEnum = pgEnum("CafeCategory", ["COFFEE", "NON_COFFEE", "FOOD", "SNACK"]);
  export const cafeOrderStatusEnum = pgEnum("CafeOrderStatus", ["NEW", "PREPARING", "READY", "COMPLETED", "CANCELLED"]);
  export const drinkTemperatureEnum = pgEnum("DrinkTemperature", ["HOT", "COLD", "ICE_BLENDED"]);
  export const sugarLevelEnum = pgEnum("SugarLevel", ["NORMAL", "LESS", "NONE"]);

  export const cafeMenuItems = pgTable("cafe_menu_items", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    category: cafeCategoryEnum("category").notNull(),
    priceRupiah: integer("price_rupiah").notNull(),
    description: text("description").notNull(),
    hasVariants: boolean("has_variants").notNull().default(false),
    available: boolean("available").notNull().default(true),
    archivedAt: timestamp("archived_at", { precision: 3, mode: "date" }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  }, (t) => [
    index("cafe_menu_items_org_id_idx").on(t.orgId),
    index("cafe_menu_items_org_id_category_idx").on(t.orgId, t.category),
  ]);

  export const cafeOrders = pgTable("cafe_orders", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    customerUserId: text("customer_user_id").references(() => appUsers.id, { onDelete: "set null" }),
    guestName: text("guest_name"),
    status: cafeOrderStatusEnum("status").notNull().default("NEW"),
    subtotalRupiah: integer("subtotal_rupiah").notNull(),
    discountRupiah: integer("discount_rupiah").notNull().default(0),
    totalRupiah: integer("total_rupiah").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  }, (t) => [
    uniqueIndex("cafe_orders_org_id_code_key").on(t.orgId, t.code),
    index("cafe_orders_org_id_idx").on(t.orgId),
    index("cafe_orders_org_id_status_idx").on(t.orgId, t.status),
    index("cafe_orders_org_id_created_at_idx").on(t.orgId, t.createdAt),
  ]);

  export const cafeOrderItems = pgTable("cafe_order_items", {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    orderId: text("order_id").notNull().references(() => cafeOrders.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id").references(() => cafeMenuItems.id, { onDelete: "set null" }),
    nameSnapshot: text("name_snapshot").notNull(),
    qty: integer("qty").notNull(),
    unitPriceRupiah: integer("unit_price_rupiah").notNull(),
    temperature: drinkTemperatureEnum("temperature"),
    sugar: sugarLevelEnum("sugar"),
  }, (t) => [index("cafe_order_items_order_id_idx").on(t.orderId)]);

  export type CafeMenuItem = InferSelectModel<typeof cafeMenuItems>;
  export type CafeOrder = InferSelectModel<typeof cafeOrders>;
  export type CafeOrderItem = InferSelectModel<typeof cafeOrderItems>;
  ```
- **Also add to the existing imports at top of the file:** `boolean` from `drizzle-orm/pg-core`.
- **Verify:** `pnpm typecheck`. (FR-100, FR-110, FR-120 / data side.)

### A2. Write the ordered DDL migration — `supabase/migrations/0005_cafe_domain.sql`  **[SEC]**
- **File:** `supabase/migrations/0005_cafe_domain.sql` (NEW). Header note matching `0000_app_schema.sql` style:
  "Cafe domain DDL (I-022). DDL authority per ADR-0015; lib/db/schema.ts is the TS query mirror kept in lockstep.
  Sorts after 0000–0004 (references organizations + app_users + current_org())."
- **Body (exact — snake_case, mirrors A1):**
  ```sql
  CREATE TYPE "public"."CafeCategory" AS ENUM ('COFFEE', 'NON_COFFEE', 'FOOD', 'SNACK');
  CREATE TYPE "public"."CafeOrderStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
  CREATE TYPE "public"."DrinkTemperature" AS ENUM ('HOT', 'COLD', 'ICE_BLENDED');
  CREATE TYPE "public"."SugarLevel" AS ENUM ('NORMAL', 'LESS', 'NONE');

  CREATE TABLE "cafe_menu_items" (
    "id" text PRIMARY KEY NOT NULL,
    "org_id" text NOT NULL,
    "name" text NOT NULL,
    "emoji" text NOT NULL,
    "category" "CafeCategory" NOT NULL,
    "price_rupiah" integer NOT NULL,
    "description" text NOT NULL,
    "has_variants" boolean DEFAULT false NOT NULL,
    "available" boolean DEFAULT true NOT NULL,
    "archived_at" timestamp (3),
    "created_at" timestamp (3) DEFAULT now() NOT NULL,
    "updated_at" timestamp (3) DEFAULT now() NOT NULL
  );
  CREATE TABLE "cafe_orders" (
    "id" text PRIMARY KEY NOT NULL,
    "org_id" text NOT NULL,
    "code" text NOT NULL,
    "customer_user_id" text,
    "guest_name" text,
    "status" "CafeOrderStatus" DEFAULT 'NEW' NOT NULL,
    "subtotal_rupiah" integer NOT NULL,
    "discount_rupiah" integer DEFAULT 0 NOT NULL,
    "total_rupiah" integer NOT NULL,
    "created_at" timestamp (3) DEFAULT now() NOT NULL,
    "updated_at" timestamp (3) DEFAULT now() NOT NULL
  );
  CREATE TABLE "cafe_order_items" (
    "id" text PRIMARY KEY NOT NULL,
    "order_id" text NOT NULL,
    "menu_item_id" text,
    "name_snapshot" text NOT NULL,
    "qty" integer NOT NULL,
    "unit_price_rupiah" integer NOT NULL,
    "temperature" "DrinkTemperature",
    "sugar" "SugarLevel"
  );

  ALTER TABLE "cafe_menu_items" ADD CONSTRAINT "cafe_menu_items_org_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cafe_orders" ADD CONSTRAINT "cafe_orders_org_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations" ("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cafe_orders" ADD CONSTRAINT "cafe_orders_customer_user_id_fk"
    FOREIGN KEY ("customer_user_id") REFERENCES "public"."app_users" ("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cafe_order_items" ADD CONSTRAINT "cafe_order_items_order_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."cafe_orders" ("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cafe_order_items" ADD CONSTRAINT "cafe_order_items_menu_item_id_fk"
    FOREIGN KEY ("menu_item_id") REFERENCES "public"."cafe_menu_items" ("id") ON DELETE set null ON UPDATE no action;

  CREATE INDEX "cafe_menu_items_org_id_idx" ON "cafe_menu_items" USING btree ("org_id");
  CREATE INDEX "cafe_menu_items_org_id_category_idx" ON "cafe_menu_items" USING btree ("org_id", "category");
  CREATE UNIQUE INDEX "cafe_orders_org_id_code_key" ON "cafe_orders" USING btree ("org_id", "code");
  CREATE INDEX "cafe_orders_org_id_idx" ON "cafe_orders" USING btree ("org_id");
  CREATE INDEX "cafe_orders_org_id_status_idx" ON "cafe_orders" USING btree ("org_id", "status");
  CREATE INDEX "cafe_orders_org_id_created_at_idx" ON "cafe_orders" USING btree ("org_id", "created_at");
  CREATE INDEX "cafe_order_items_order_id_idx" ON "cafe_order_items" USING btree ("order_id");
  ```
- **Verify:** `pnpm exec supabase db reset` applies all migrations clean (0000→0005), exit 0.
  (FR-100, FR-110, FR-120.)

### A3. Append the RLS backstop to the SAME migration — `supabase/migrations/0005_cafe_domain.sql`  **[SEC]**
- **File:** `supabase/migrations/0005_cafe_domain.sql` (append after the DDL; mirror `0002`/`0004` exactly).
- **Add:**
  ```sql
  -- RLS backstop (ADR-0015 §3) — defense-in-depth; the server (postgres/service-role
  -- via lib/db/drizzle.ts) bypasses RLS and stays the authoritative gate. Guests have
  -- no JWT: their order insert is performed server-side privileged (see Phase D), so
  -- these authenticated-role policies do NOT gate the guest path.
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cafe_menu_items TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cafe_orders TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cafe_order_items TO authenticated;

  ALTER TABLE cafe_menu_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cafe_orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cafe_order_items ENABLE ROW LEVEL SECURITY;

  CREATE POLICY cafe_menu_items_org_isolation ON cafe_menu_items
    FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org());
  CREATE POLICY cafe_orders_org_isolation ON cafe_orders
    FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org());
  -- cafe_order_items has no org_id; scope via its parent order's org.
  CREATE POLICY cafe_order_items_org_isolation ON cafe_order_items
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM cafe_orders o WHERE o.id = order_id AND o.org_id = current_org()))
    WITH CHECK (EXISTS (SELECT 1 FROM cafe_orders o WHERE o.id = order_id AND o.org_id = current_org()));
  ```
- **Verify:** `pnpm exec supabase db reset` still clean; in `psql`, `select relrowsecurity from pg_class where
  relname='cafe_orders';` returns `t`. (ADR-0015 §3.)

### A4. Provide the down-file to match the repo convention — `supabase/migrations/_down/0005_cafe_domain.down.sql`
- **File:** `supabase/migrations/_down/0005_cafe_domain.down.sql` (NEW; not the CI path, convention only — confirm the
  `_down` dir exists for 0000–0004 and mirror its header style).
- **Body:** drop policies, then tables (CASCADE), then types, reverse order:
  ```sql
  DROP TABLE IF EXISTS "cafe_order_items" CASCADE;
  DROP TABLE IF EXISTS "cafe_orders" CASCADE;
  DROP TABLE IF EXISTS "cafe_menu_items" CASCADE;
  DROP TYPE IF EXISTS "public"."SugarLevel";
  DROP TYPE IF EXISTS "public"."DrinkTemperature";
  DROP TYPE IF EXISTS "public"."CafeOrderStatus";
  DROP TYPE IF EXISTS "public"."CafeCategory";
  ```
- **Verify:** file lints as SQL (no apply in CI). (Repo convention.)

### A5. Seed the captured 16-item menu (idempotent Drizzle upsert) — `scripts/seed-supabase.ts`  **[SEC-lite]**
- **File:** `scripts/seed-supabase.ts` (extend `main()` after the users loop; reuse the `db`/`org` already in scope).
- **Add import:** `import { cafeMenuItems } from "@/lib/db/schema";` and the category map + the 16 rows copied
  **verbatim** from `lib/mock/cafe.ts` (`americano, latte, cappuccino, espresso, matcha, chocolate, orange-juice,
  lemon-tea, tempe-orek, croissant, sandwich, salad, nasi-rames, mie-goreng, tahu-goreng, chicken-wings`):
  ```ts
  const CATEGORY_MAP: Record<string, "COFFEE" | "NON_COFFEE" | "FOOD" | "SNACK"> = {
    Coffee: "COFFEE", "Non-Coffee": "NON_COFFEE", Food: "FOOD", Snack: "SNACK",
  };
  const MENU = [/* 16 rows: { slug, name, emoji, category, price, description, hasVariants } verbatim */];
  for (const m of MENU) {
    const id = `${org.id}__${m.slug}`; // deterministic id → idempotent
    const [existingItem] = await db.select().from(cafeMenuItems).where(eq(cafeMenuItems.id, id)).limit(1);
    if (!existingItem) {
      await db.insert(cafeMenuItems).values({
        id, orgId: org.id, name: m.name, emoji: m.emoji,
        category: CATEGORY_MAP[m.category], priceRupiah: m.price,
        description: m.description, hasVariants: m.hasVariants,
      });
    }
  }
  console.log(`Seeded ${MENU.length} cafe menu items into "${org.slug}".`);
  ```
  (Use the deterministic-id no-op-if-exists idempotency pattern already used for the `appUsers` upsert in this file —
  not `onConflictDoUpdate`, to stay consistent with the file's existing style.)
- **Verify:** `pnpm exec supabase db reset && pnpm db:seed:supabase` (run twice) succeeds idempotently; then
  `psql "$DATABASE_URL" -c "select count(*) from cafe_menu_items;"` returns 16. (FR-103.)

---

## Phase B — Carry `lib/cafe/*` onto the new enum source (UNIT)

> All five `lib/cafe/*` source files + their unit tests already exist and already encode AC-110/111/120 + the authz
> guard. The ONLY change is re-pointing the enum-type import. Do NOT rewrite the logic.

### B0. Re-point enum-type imports `@prisma/client` → `@/lib/db/enums`  **[SEC-lite]**
- **Files (4 — the enum-type importers):**
  - `lib/cafe/types.ts` line 5: `import type { CafeCategory, CafeOrderStatus, DrinkTemperature, SugarLevel } from "@prisma/client";`
    → `from "@/lib/db/enums";` (keep the `export type { … }` re-export line 6).
  - `lib/cafe/status.ts` line 4: `import type { CafeOrderStatus } from "@prisma/client";` → `from "@/lib/db/enums";`
  - `lib/cafe/eligibility.ts` line 7: `import type { Role } from "@prisma/client";` → `from "@/lib/db/enums";`
  - `lib/cafe/authz.ts` line 6: `import type { Role } from "@prisma/client";` → `from "@/lib/db/enums";`
  - (`lib/cafe/pricing.ts` imports only from `@/lib/cafe/types` — no change.)
- **Verify:** `pnpm vitest run lib/cafe/` → all of `status.test.ts`, `pricing.test.ts`, `eligibility.test.ts`,
  `authz.test.ts` GREEN (AC-110, AC-111, AC-120, AC-123-unit-guard preserved); `pnpm typecheck` clean for `lib/cafe/*`.
  (FR-111/112/114/120/122, ADR-0011/0012 — logic unchanged.)

> **Note on `lib/cafe/authz.ts`:** it imports `advanceOrderStatus` from `@/lib/db/cafe`, which does not exist until
> Phase C. After B0 the file typechecks against the *type* import but `lib/cafe/authz.test.ts` (pure `canMutate…`)
> passes; the `advanceOrderStatusAsActor` integration proof runs in Phase D once the repo exists.

---

## Phase C — Repository `lib/db/cafe.ts` (Drizzle, INTEGRATION)  **[SEC]**

> **Harness:** new `lib/db/cafe.int.test.ts` mirrors `lib/db/users.int.test.ts` exactly: a dedicated
> `testSql = postgres(TEST_URL,{prepare:false,max:3})` + `testDb = drizzle(testSql,{schema})`; `beforeAll`/`afterAll`
> raw `TRUNCATE TABLE "cafe_order_items","cafe_orders","cafe_menu_items","app_users","organizations" RESTART IDENTITY
> CASCADE`; seed org A + org B, one app_user per org, and per-org menu items (latte 32000 + croissant 25000 in A;
> one item in B) returning their ids. The repo under test (`lib/db/cafe.ts`) uses the app singleton `db` from
> `@/lib/db/drizzle` (privileged connection → RLS-bypass, matching `lib/db/users.ts`).

### C1. `listMenu(orgId)` — org-scoped, available-only, sorted — **AC-100**  **[SEC]**
- **Test first** (`lib/db/cafe.int.test.ts`): seed org A with 2 available + 1 `available:false` ("HiddenItem") + 1
  `archivedAt` ("ArchivedItem"), org B with 1 ("OrgBItem").
  ```ts
  it("AC-100: listMenu returns only orgA available, non-archived items, ordered by category then name", async () => {
    const items = await listMenu(orgAId);
    expect(items.every((i) => i.orgId === orgAId)).toBe(true);
    const names = items.map((i) => i.name);
    expect(names).not.toContain("HiddenItem");
    expect(names).not.toContain("ArchivedItem");
    expect(names).not.toContain("OrgBItem");
  });
  ```
- **Implement** (`lib/db/cafe.ts`, mirroring `lib/db/users.ts#listByOrg`):
  ```ts
  import { and, eq, isNull, asc, desc, inArray } from "drizzle-orm";
  import { db } from "@/lib/db/drizzle";
  import { cafeMenuItems, cafeOrders, cafeOrderItems, appUsers,
    type CafeMenuItem, type CafeOrder, type CafeOrderItem } from "@/lib/db/schema";

  export function listMenu(orgId: string): Promise<CafeMenuItem[]> {
    return db.select().from(cafeMenuItems)
      .where(and(eq(cafeMenuItems.orgId, orgId), isNull(cafeMenuItems.archivedAt), eq(cafeMenuItems.available, true)))
      .orderBy(asc(cafeMenuItems.category), asc(cafeMenuItems.name));
  }
  ```
- **Verify:** `pnpm test:int lib/db/cafe.int.test.ts -t AC-100`. (FR-101, FR-103 / AC-100.)

### C2. `createOrder` — server-priced single transaction, member customer — **AC-112, AC-125**  **[SEC]**
- **Test first** (add):
  ```ts
  it("AC-112: createOrder persists member order with server totals, NEW, unique code, line snapshots", async () => {
    const order = await createOrder({ orgId: orgAId, customerUserId: aUserId, guestName: null,
      lines: [{ menuItemId: latteAId, qty: 1 }, { menuItemId: croissantAId, qty: 2 }], discountEligible: false });
    expect(order.orgId).toBe(orgAId);
    expect(order.customerUserId).toBe(aUserId);
    expect(order.guestName).toBeNull();
    expect(order.status).toBe("NEW");
    expect(order.subtotalRupiah).toBe(82000);
    expect(order.totalRupiah).toBe(82000);
    expect(order.code).toMatch(/^[0-9a-z]{6}$/);
    const items = await testDb.select().from(cafeOrderItems).where(eq(cafeOrderItems.orderId, order.id));
    const latte = items.find((i) => i.menuItemId === latteAId);
    expect(latte?.unitPriceRupiah).toBe(32000);
    expect(latte?.nameSnapshot).toBe("Latte");
  });
  it("AC-125: createOrder rejects a menuItemId from another org (no cross-org pricing), new order's orgId = A", async () => {
    await expect(createOrder({ orgId: orgAId, customerUserId: aUserId, guestName: null,
      lines: [{ menuItemId: orgBItemId, qty: 1 }], discountEligible: false })).rejects.toThrow();
  });
  ```
- **Implement** (add to `lib/db/cafe.ts`): look up each line's item **within `orgId`** via
  `inArray(cafeMenuItems.id, ids)` filtered by `eq(orgId)`; reject if any line id is unknown/cross-org or `lines` is
  empty (throw before any write). Snapshot `nameSnapshot`+`unitPriceRupiah`, call `computeOrderTotals`,
  `generateOrderCode()`, insert order + items in **one** `db.transaction(async (tx) => { … })`. On a unique-violation
  on `(org_id, code)` retry up to 5× with a fresh code (ADR-0012); after 5 throw `CODE_GENERATION_FAILED`.
  ```ts
  import { computeOrderTotals } from "@/lib/cafe/pricing";
  import { generateOrderCode } from "@/lib/cafe/status";
  import type { OrderLineInput } from "@/lib/cafe/types";
  export async function createOrder(input: {
    orgId: string; customerUserId: string | null; guestName: string | null;
    lines: OrderLineInput[]; discountEligible: boolean;
  }): Promise<CafeOrder> { /* guard → price within org → tx insert with bounded code retry */ }
  ```
- **Verify:** `pnpm test:int lib/db/cafe.int.test.ts -t AC-112` and `-t AC-125`.
  (FR-111, FR-112, FR-114, FR-115 / AC-112, AC-125.)

### C3. `createOrder` — guest path + zero-line rejection — **AC-113, AC-114**  **[SEC]**
- **Test first** (add):
  ```ts
  it("AC-113: guest order captures name, no discount, customerUserId null", async () => {
    const o = await createOrder({ orgId: orgAId, customerUserId: null, guestName: "Sari",
      lines: [{ menuItemId: latteAId, qty: 1 }], discountEligible: false });
    expect(o.guestName).toBe("Sari");
    expect(o.customerUserId).toBeNull();
    expect(o.discountRupiah).toBe(0);
    expect(o.totalRupiah).toBe(o.subtotalRupiah);
    expect(o.status).toBe("NEW");
  });
  it("AC-114: order with zero valid lines is rejected, no write", async () => {
    const [{ count: before }] = await testSql`select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
    await expect(createOrder({ orgId: orgAId, customerUserId: null, guestName: "X",
      lines: [], discountEligible: false })).rejects.toThrow();
    const [{ count: after }] = await testSql`select count(*)::int as count from cafe_orders where org_id = ${orgAId}`;
    expect(after).toBe(before);
  });
  ```
- **Implement:** the empty-`lines`/no-valid-items guard from C2 already covers AC-114 (throw before any write). Guest
  *name non-empty* validation is enforced in the server action (Phase D), not the repo — the repo accepts a provided
  `guestName`. No new code beyond the C2 guard; this task adds the two tests.
- **Verify:** `pnpm test:int lib/db/cafe.int.test.ts -t AC-113` and `-t AC-114`. (FR-113, FR-114 / AC-113, AC-114.)

### C4. `advanceOrderStatus(orgId, id)` — forward step, org-scoped — **AC-122, AC-124**  **[SEC]**
- **Test first** (add):
  ```ts
  it("AC-122: advanceOrderStatus walks NEW→PREPARING→READY→COMPLETED then rejects a 4th call", async () => {
    const o = await createOrder({ orgId: orgAId, customerUserId: aUserId, guestName: null,
      lines: [{ menuItemId: latteAId, qty: 1 }], discountEligible: false });
    expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("PREPARING");
    expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("READY");
    expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("COMPLETED");
    await expect(advanceOrderStatus(orgAId, o.id)).rejects.toThrow();
  });
  it("AC-124: advanceOrderStatus on a cross-org order forbids (lookup null), no write", async () => {
    const oB = await createOrder({ orgId: orgBId, customerUserId: bUserId, guestName: null,
      lines: [{ menuItemId: orgBItemId, qty: 1 }], discountEligible: false });
    await expect(advanceOrderStatus(orgAId, oB.id)).rejects.toThrow();
    const [fresh] = await testDb.select().from(cafeOrders).where(eq(cafeOrders.id, oB.id));
    expect(fresh.status).toBe("NEW");
  });
  ```
- **Implement** (add to `lib/db/cafe.ts`, mirroring `lib/db/users.ts#findById` org-scope):
  ```ts
  import { nextStatus } from "@/lib/cafe/status";
  export async function advanceOrderStatus(orgId: string, id: string): Promise<CafeOrder> {
    const [order] = await db.select().from(cafeOrders)
      .where(and(eq(cafeOrders.id, id), eq(cafeOrders.orgId, orgId))).limit(1);
    if (!order) throw new Error("NOT_FOUND");
    const next = nextStatus(order.status);
    if (!next) throw new Error("INVALID_TRANSITION");
    const [updated] = await db.update(cafeOrders)
      .set({ status: next, updatedAt: new Date() })
      .where(and(eq(cafeOrders.id, id), eq(cafeOrders.orgId, orgId))).returning();
    return updated;
  }
  ```
- **Verify:** `pnpm test:int lib/db/cafe.int.test.ts -t AC-122` and `-t AC-124`.
  (FR-120, FR-121, FR-123 / AC-122, AC-124.)

### C5. `listOrders` / `getOrder` / `setOrderStatus` — org-scoped reads + admin free-set — **AC-125**  **[SEC]**
- **Test first** (add):
  ```ts
  it("AC-125: listOrders returns only the caller org's orders, newest first, with items + customer", async () => {
    const aOrders = await listOrders(orgAId);
    expect(aOrders.every((o) => o.orgId === orgAId)).toBe(true);
    expect(Array.isArray(aOrders[0]?.items)).toBe(true);
  });
  it("listOrders filters by status set (KDS reads NEW/PREPARING/READY)", async () => {
    const kds = await listOrders(orgAId, { statuses: ["NEW", "PREPARING", "READY"] });
    expect(kds.every((o) => ["NEW", "PREPARING", "READY"].includes(o.status))).toBe(true);
  });
  ```
- **Implement** (add to `lib/db/cafe.ts`). **`listOrders` MUST return each order with `items: CafeOrderItem[]` and a
  nested `customer: { id; name; email } | null`** — the admin page (`app/(admin)/admin/orders/page.tsx`) reads
  `o.customer?.name` / `o.customer?.email` and `o.items`, and the barista page reads `o.items`. Implement with a
  left join on `appUsers` (selecting ONLY `id`/`name`/`email` — never a password column; there is none) + a second
  query (or `inArray`) to attach items, returning a typed `CafeOrderWithRelations`:
  ```ts
  export type CafeOrderWithRelations = CafeOrder & {
    items: CafeOrderItem[];
    customer: { id: string; name: string; email: string } | null;
  };
  export async function listOrders(
    orgId: string, opts?: { statuses?: CafeOrderStatus[]; limit?: number },
  ): Promise<CafeOrderWithRelations[]> { /* org-scoped, desc(createdAt), optional inArray(status), attach items + customer */ }
  export async function getOrder(orgId: string, id: string): Promise<CafeOrderWithRelations | null> { /* findFirst org-scoped + items + customer */ }
  export async function setOrderStatus(orgId: string, id: string, status: CafeOrderStatus): Promise<CafeOrder> {
    const [order] = await db.select().from(cafeOrders)
      .where(and(eq(cafeOrders.id, id), eq(cafeOrders.orgId, orgId))).limit(1);
    if (!order) throw new Error("NOT_FOUND");
    const [updated] = await db.update(cafeOrders).set({ status, updatedAt: new Date() })
      .where(and(eq(cafeOrders.id, id), eq(cafeOrders.orgId, orgId))).returning();
    return updated;
  }
  ```
- **Verify:** `pnpm test:int lib/db/cafe.int.test.ts -t AC-125`; `pnpm typecheck` (the surface pages that consume
  `o.items`/`o.customer` must now typecheck against `CafeOrderWithRelations`). (FR-124, FR-130, FR-131 / AC-125.)

---

## Phase D — Server actions + Supabase-session authz (INTEGRATION)  **[SEC]**

### D0. Re-point the guest org lookup off the removed Prisma singleton — `app/cafe/actions.ts`  **[SEC]**
- **File:** `app/cafe/actions.ts` (it currently `import { prisma } from "@/lib/db/client"` — that module is GONE).
- **Change:** replace `resolveGuestOrgId` with a Drizzle lookup; keep the rest of `placeOrder` unchanged (it already
  calls `getSessionUser`, `resolveDiscountEligibility`, `createOrder`):
  ```ts
  import { db } from "@/lib/db/drizzle";
  import { organizations } from "@/lib/db/schema";
  import { eq } from "drizzle-orm";
  async function resolveGuestOrgId(slug: string): Promise<string> {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) throw new Error("ORG_NOT_FOUND");
    return org.id;
  }
  ```
  Remove the `import { prisma } from "@/lib/db/client";` line. (Guest insert runs via the privileged `db` singleton →
  RLS-bypass, so the guest path is unaffected by the Phase A policies — the [SEC] note in A3 documents this seam.)
- **Verify:** `pnpm typecheck`; `pnpm lint:ci`. (FR-113, FR-115.)

### D1. Guest name-required guard test — **AC-114 (action layer)**  **[SEC]**
- **File:** `app/cafe/actions.int.test.ts` (NEW) — `placeOrder` already throws `GUEST_NAME_REQUIRED` on blank name
  (`app/cafe/actions.ts` line 51-52). Drive the guest branch (no session) with a blank name and assert no write.
  Seed an org by slug matching `SEED_ORG_SLUG` (default `flowspace`) so `resolveGuestOrgId` resolves; assert the
  throw and that `cafe_orders` count is unchanged.
  ```ts
  it("AC-114: placeOrder (guest, blank name) throws GUEST_NAME_REQUIRED and writes nothing", async () => {
    await expect(placeOrder({ lines: [{ menuItemId: itemId, qty: 1 }], guestName: "  " }))
      .rejects.toThrow(/GUEST_NAME_REQUIRED/);
  });
  ```
  (No session is present in the vitest server context → `getSessionUser()` returns null → guest branch.)
- **Verify:** `pnpm test:int app/cafe/actions.int.test.ts -t AC-114`. (FR-113 / AC-114, action layer.)

### D2. Member-cannot-mutate server-side deny — **AC-123**  **[SEC]**
- **Unit guard (already green from B0):** `lib/cafe/authz.test.ts` "AC-123: MEMBER cannot mutate; BARISTA/ADMIN can".
  Confirm it still passes (the canonical AC-123 *decision* lives here per the pyramid).
- **Integration no-write proof** (add to `lib/db/cafe.int.test.ts`, using the carried `advanceOrderStatusAsActor`
  test seam in `lib/cafe/authz.ts`):
  ```ts
  it("AC-123: a MEMBER-role actor cannot advance status — server-side deny, no write", async () => {
    const o = await createOrder({ orgId: orgAId, customerUserId: aUserId, guestName: null,
      lines: [{ menuItemId: latteAId, qty: 1 }], discountEligible: false });
    await expect(advanceOrderStatusAsActor({ id: aUserId, role: "MEMBER", orgId: orgAId }, o.id))
      .rejects.toThrow(/FORBIDDEN/);
    const [fresh] = await testDb.select().from(cafeOrders).where(eq(cafeOrders.id, o.id));
    expect(fresh.status).toBe("NEW");
  });
  ```
- **No prod change** — `app/barista/actions.ts` + `app/(admin)/admin/orders/actions.ts` already gate via
  `requireSession` + `canMutateOrderStatus` / `role === "ADMIN"` and import `advanceOrderStatus`/`setOrderStatus`
  from `@/lib/db/cafe` (which exists after Phase C). This task is the integration proof that the gate denies + the
  repo writes nothing. Confirm both action files still typecheck (they import `@/lib/auth/session` + `@/lib/cafe/authz`,
  both intact).
- **Verify:** `pnpm vitest run lib/cafe/authz.test.ts` (unit) + `pnpm test:int lib/db/cafe.int.test.ts -t AC-123`
  (integration); `pnpm typecheck`. (FR-122 / AC-123.)

---

## Phase E — Re-point the 5 surfaces (UI pixel-identical, NFR-101) (UNIT + static)

> Every surface page + the `*.test.tsx` already exist from the old build. The work is: (1) re-point each page's
> `import type { … } from "@prisma/client"` → `@/lib/db/enums`; (2) replace the Prisma `organization.findUnique` in
> the guest page; (3) make sure the page→client view-mapping still compiles against `CafeMenuItem` /
> `CafeOrderWithRelations`. **No JSX/markup changes** — the client components + their existing tests stay byte-stable.

### E1. Member `/cafe` — re-point enum import — **AC-101 (render)**
- **File:** `app/(member)/cafe/page.tsx` line 12: `import type { CafeCategory } from "@prisma/client";` →
  `from "@/lib/db/enums";`. The body already maps `listMenu` rows → `MenuItemView`; no other change.
- **Test (exists):** `app/(member)/cafe/CafeClient.test.tsx` "AC-101: renders the menu items passed as props" — keep.
- **Verify:** `pnpm vitest run "app/(member)/cafe/CafeClient.test.tsx"`;
  static gate `! grep -rq "lib/mock/cafe" "app/(member)/cafe/page.tsx"` (no mock import). (FR-102 / AC-101.)

### E2. Guest `/cafe/guest` — re-point Prisma org lookup
- **File:** `app/(public)/cafe/guest/page.tsx` lines 13 + 18-23: remove `import { prisma } from "@/lib/db/client";`
  and rewrite `resolveOrgId` with the Drizzle `organizations` query (same shape as D0). Keep `export const dynamic =
  "force-dynamic";` and the `listMenu` mapping.
  ```ts
  import { db } from "@/lib/db/drizzle";
  import { organizations } from "@/lib/db/schema";
  import { eq } from "drizzle-orm";
  async function resolveOrgId(): Promise<string> {
    const slug = process.env.SEED_ORG_SLUG ?? "flowspace";
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!org) throw new Error(`ORG_NOT_FOUND: ${slug}`);
    return org.id;
  }
  ```
- **Test (exists):** `app/(public)/cafe/guest/GuestCafeClient.test.tsx` — keep.
- **Verify:** `pnpm vitest run "app/(public)/cafe/guest/GuestCafeClient.test.tsx"`; `pnpm typecheck`. (FR-102, FR-113.)

### E3. Admin `/admin/pos` — confirm (no enum import) (OQ-2: read-only menu, checkout dormant)
- **File:** `app/(admin)/admin/pos/page.tsx` — already imports only `listMenu` (no `@prisma/client`). No change beyond
  confirming it compiles against the new `CafeMenuItem` type. POS checkout stays inert (OQ-2/FU-3).
- **Test (exists):** `app/(admin)/admin/pos/PosClient.test.tsx` — keep.
- **Verify:** `pnpm vitest run "app/(admin)/admin/pos/PosClient.test.tsx"`; `pnpm typecheck`. (FR-102.)

### E4. Barista `/barista` — re-point enum import — supports **AC-121**
- **File:** `app/barista/page.tsx` line 11: `import type { DrinkTemperature, SugarLevel } from "@prisma/client";` →
  `from "@/lib/db/enums";`. Body already maps `listOrders(orgId,{statuses:[…]})` → `BaristaOrderView` and reads
  `o.items` — confirm it typechecks against `CafeOrderWithRelations.items`.
- **Test (exists):** `app/barista/BaristaClient.test.tsx` — keep (NEW column shows the order code + line).
- **Verify:** `pnpm vitest run "app/barista/BaristaClient.test.tsx"`;
  static gate `! grep -rq "lib/mock/barista" app/barista/`. (FR-130 / supports AC-121.)

### E5. Admin `/admin/orders` — re-point enum import (reads `o.customer` + `o.items`)
- **File:** `app/(admin)/admin/orders/page.tsx` line 11: `import type { DrinkTemperature, SugarLevel } from
  "@prisma/client";` → `from "@/lib/db/enums";`. Body reads `o.customer?.name`, `o.customer?.email`, `o.items` — these
  now resolve against `CafeOrderWithRelations` from C5 (the nested-customer join is the load-bearing reason `listOrders`
  must return `customer`). "Hapus" stays dormant (OQ-5/FU-4). No JSX change.
- **Test (exists):** `app/(admin)/admin/orders/OrdersClient.test.tsx` + `page.test.tsx` — keep.
- **Verify:** `pnpm vitest run "app/(admin)/admin/orders/"`; `pnpm typecheck`. (FR-124, FR-130.)

---

## Phase F — Supabase Realtime KDS (separable) — OQ-4 (in scope)  **[SEC]**

> Replaces the manual-refresh MVP with a live subscription so a new/changed order updates `/barista` without a click.
> Org-scoped channel, RLS + server-filtered so no cross-org row leaks. **Manual "Refresh" stays as fallback.** Use the
> existing `lib/supabase/client.ts` browser-client seam (anon key only — never service-role in the client bundle).

### F0. Confirm Realtime is enabled for `cafe_orders` in the migration  **[SEC]**
- **File:** `supabase/migrations/0005_cafe_domain.sql` (append, after RLS) — add `cafe_orders` to the
  `supabase_realtime` publication so postgres-changes events fire. Follow the publication-add pattern; if I-005 has
  no realtime migration yet, add:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE cafe_orders;
  ```
  Realtime respects RLS for the `authenticated` role, so a subscribed barista client only receives its own org's rows
  (the Phase A `cafe_orders_org_isolation` policy is the row filter). The client ALSO filters by `org_id` in the
  channel `filter` for defense-in-depth.
- **Verify:** `pnpm exec supabase db reset` clean; `psql` → `select 1 from pg_publication_tables where
  pubname='supabase_realtime' and tablename='cafe_orders';` returns a row. (OQ-4.)

### F1. KDS live subscription hook — `app/barista/useKdsRealtime.ts`  **[SEC]**
- **File:** `app/barista/useKdsRealtime.ts` (NEW, `"use client"`). A hook that opens an org-scoped channel and calls
  `router.refresh()` on any `cafe_orders` INSERT/UPDATE for the org (re-running the server component's `listOrders`):
  ```ts
  "use client";
  import { useEffect } from "react";
  import { useRouter } from "next/navigation";
  import { createSupabaseBrowserClient } from "@/lib/supabase/client";
  export function useKdsRealtime(orgId: string) {
    const router = useRouter();
    useEffect(() => {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`kds:${orgId}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "cafe_orders", filter: `org_id=eq.${orgId}` },
          () => router.refresh())
        .subscribe();
      return () => { void supabase.removeChannel(channel); };
    }, [orgId, router]);
  }
  ```
- **Test first:** `app/barista/useKdsRealtime.test.tsx` (RTL + jsdom), mock `createSupabaseBrowserClient` to a fake
  channel; assert (a) `.channel("kds:<orgId>")` + the `postgres_changes` `filter` is `org_id=eq.<orgId>`
  (cross-org-leak guard), and (b) the registered callback calls `router.refresh`:
  ```ts
  it("subscribes to an org-scoped channel and refreshes on a cafe_orders change (no cross-org filter leak)", () => { /* … */ });
  ```
- **Verify:** `pnpm vitest run "app/barista/useKdsRealtime.test.tsx"`. (OQ-4 — integration-level channel/filter
  assertion at the unit layer; no extra e2e needed.)

### F2. Wire the hook into the barista surface (keep manual Refresh)
- **Files:** `app/barista/page.tsx` — pass `user.orgId` to `BaristaClient` as an `orgId` prop;
  `app/barista/BaristaClient.tsx` — call `useKdsRealtime(orgId)` at the top of the component. **Do not remove** the
  existing manual "Refresh" button / `router.refresh()` (fallback). No other markup change (NFR-101).
- **Test (exists):** `app/barista/BaristaClient.test.tsx` — add the new required `orgId` prop to the render; assert the
  existing NEW-column assertion still passes (markup unchanged).
- **Verify:** `pnpm vitest run "app/barista/BaristaClient.test.tsx"`; `pnpm typecheck`. (OQ-4, NFR-101.)

---

## Phase G — One curated E2E — **AC-121**

### G1. Member places an order → it appears in the barista KDS as NEW
- **File:** `e2e/AC-121-member-order-to-kds.spec.ts` (NEW). Two browser contexts (member, barista). Use the seeded
  creds (`budi@flowspace.test`/`dev-member-pw`, `barista@flowspace.test`/`dev-barista-pw`) and the `loginAs` helper
  pattern from the existing `e2e/AC-010-*` spec. Title leads with the AC id (pyramid tagging rule).
  ```ts
  test("AC-121 member order appears in the barista KDS as NEW", async ({ browser }) => {
    // member ctx: login budi → /cafe → add a no-variant item (Croissant) → checkout (placeOrder).
    // barista ctx: login barista → /barista → assert the "Pesanan Baru" (NEW) column shows the placed order's line.
  });
  ```
- **Verify:** `pnpm e2e e2e/AC-121-member-order-to-kds.spec.ts` against a freshly reset + seeded local Supabase stack.
  (FR-114, FR-130 / AC-121.)

---

## Final gates (run before review hand-off)
- `pnpm exec supabase db reset` → all migrations 0000–0005 apply clean.
- `pnpm db:seed:supabase` (twice) → idempotent; 16 `cafe_menu_items` present.
- `pnpm typecheck` → 0 errors (no `@prisma/client` / `lib/db/client` imports remain anywhere — `grep -rn
  "@prisma/client\|lib/db/client" lib app scripts` returns nothing).
- `pnpm lint:ci` → 0 errors/warnings.
- `pnpm test:unit` → green (`lib/cafe/*`, surface `*.test.tsx`, `useKdsRealtime`).
- `pnpm test:int` → green (`lib/db/cafe.int.test.ts`, `app/cafe/actions.int.test.ts`); changed-code coverage ≥80%.
- `pnpm e2e` → AC-121 green.
- `pnpm build` → green (server/client split compiles).

---

## Traceability — AC → owning layer → owning test (ADR-0010; one owning layer per AC)
| AC | Owning layer | Owning test (title token / file) | FR |
|----|--------------|----------------------------------|----|
| AC-100 | Integration (Drizzle/Supabase) | `lib/db/cafe.int.test.ts` "AC-100: listMenu …" | FR-101, FR-103 |
| AC-101 | Unit (RTL) | `app/(member)/cafe/CafeClient.test.tsx` "AC-101: renders the menu …" (+ static no-mock-import gate) | FR-102 |
| AC-110 | Unit (Vitest) | `lib/cafe/pricing.test.ts` "AC-110: no discount …" | FR-111 |
| AC-111 | Unit (Vitest) | `lib/cafe/pricing.test.ts` "AC-111: eligible → 5% …" | FR-112, NFR-100 |
| AC-112 | Integration | `lib/db/cafe.int.test.ts` "AC-112: createOrder persists member …" | FR-111/112/114/115 |
| AC-113 | Integration | `lib/db/cafe.int.test.ts` "AC-113: guest order captures name …" | FR-113, FR-114 |
| AC-114 | Integration | `lib/db/cafe.int.test.ts` "AC-114: zero valid lines rejected …" (+ action-layer guard `app/cafe/actions.int.test.ts`) | FR-113, FR-114 |
| AC-120 | Unit (Vitest) | `lib/cafe/status.test.ts` "AC-120: advances NEW→…" | FR-120 |
| AC-121 | E2E (Playwright) | `e2e/AC-121-member-order-to-kds.spec.ts` | FR-114, FR-130 |
| AC-122 | Integration | `lib/db/cafe.int.test.ts` "AC-122: advanceOrderStatus walks …" | FR-120/121/123 |
| AC-123 | Unit guard (decision) + Integration (no-write proof) | `lib/cafe/authz.test.ts` "AC-123: MEMBER cannot mutate …" + `lib/db/cafe.int.test.ts` "AC-123: MEMBER actor no write …" | FR-122 |
| AC-124 | Integration | `lib/db/cafe.int.test.ts` "AC-124: cross-org advance forbids …" | FR-123 |
| AC-125 | Integration | `lib/db/cafe.int.test.ts` "AC-125: listOrders/createOrder org-scoped …" | FR-115, FR-130 |

> AC-123 owning *decision* layer is the unit guard (the pyramid's lowest sufficient layer for the role rule); the
> integration test is the required no-write security proof, not a second owner of the decision.

---

## Carry-vs-rewrite file manifest
| File | Action | Why |
|---|---|---|
| `lib/cafe/pricing.ts` + `.test.ts` | **CARRY as-is** | imports only `@/lib/cafe/types`; no stack dep |
| `lib/cafe/status.ts` + `.test.ts` | **CARRY, re-point enum import** (B0) | `@prisma/client` → `@/lib/db/enums` |
| `lib/cafe/eligibility.ts` + `.test.ts` | **CARRY, re-point enum import** (B0) | same |
| `lib/cafe/authz.ts` + `.test.ts` | **CARRY, re-point enum import** (B0) | same; depends on `@/lib/db/cafe` (Phase C) |
| `lib/cafe/types.ts` | **CARRY, re-point enum import** (B0) | DTO shapes unchanged |
| `lib/db/enums.ts` | **EXTEND** (A0) | add 4 cafe enums (new enum source of truth) |
| `lib/db/schema.ts` | **EXTEND** (A1) | add 3 Drizzle mirror tables + 4 `pgEnum`s |
| `supabase/migrations/0005_cafe_domain.sql` | **NEW** (A2/A3/F0) | DDL authority + RLS + realtime publication |
| `supabase/migrations/_down/0005_cafe_domain.down.sql` | **NEW** (A4) | repo convention (not CI path) |
| `scripts/seed-supabase.ts` | **EXTEND** (A5) | 16-item idempotent menu upsert |
| `lib/db/cafe.ts` | **WRITE FRESH** (Phase C) | repo never ported; was Prisma — now Drizzle mirroring `lib/db/users.ts` |
| `lib/db/cafe.int.test.ts` | **NEW** (Phase C/D) | integration suite mirroring `lib/db/users.int.test.ts` |
| `app/cafe/actions.ts` | **EDIT** (D0) | drop `lib/db/client` Prisma; Drizzle org-by-slug lookup |
| `app/cafe/actions.int.test.ts` | **NEW** (D1) | guest name-required action guard |
| `app/(member)/cafe/page.tsx` | **EDIT** (E1) | enum import re-point |
| `app/(public)/cafe/guest/page.tsx` | **EDIT** (E2) | drop Prisma org lookup → Drizzle |
| `app/(admin)/admin/pos/page.tsx` | **CONFIRM** (E3) | no enum import; compiles against new types |
| `app/barista/page.tsx` | **EDIT** (E4/F2) | enum import re-point; pass `orgId` for realtime |
| `app/(admin)/admin/orders/page.tsx` | **EDIT** (E5) | enum import re-point; consumes `customer` join |
| `app/barista/actions.ts`, `app/(admin)/admin/orders/actions.ts` | **CONFIRM** (D2) | already Supabase-session gated; compile after Phase C |
| All five `*Client.tsx` + their `*.test.tsx` | **CARRY as-is / +orgId prop** | pixel-identical UI (NFR-101); only `BaristaClient` gains an `orgId` prop (F2) |
| `app/barista/useKdsRealtime.ts` + `.test.tsx` | **NEW** (F1) | Supabase Realtime KDS |
| `e2e/AC-121-member-order-to-kds.spec.ts` | **NEW** (G1) | the one curated journey |

## Security / money-path slices (Director must verify; NOT same-family-only — `docs/pi-delegation.md`)
- **A1/A2/A3 + F0** — schema, FKs, **RLS policies**, realtime publication (tenancy backstop + the order-items
  parent-org subquery policy + the guest-path RLS-bypass reasoning).
- **C1–C5** — repo `org_id` scoping on every read/write; cross-org lookup → null → forbid; the customer join must
  never select a credential column (there is none, but assert it).
- **C2** — **server-computed totals** (never trust client prices/totals) + within-org menu pricing + bounded
  unique-code retry in a single transaction.
- **D0/D2** — guest org resolution server-side (never client `orgId`); server-side role gate (MEMBER deny) with the
  no-write integration proof.

## Follow-ups (out of scope, tracked)
- **FU-2:** booking/"active session" domain → flips `resolveDiscountEligibility` to apply the dormant 5% (OQ-1, ADR-0011).
- **FU-3:** POS checkout write + member-discount-rate reconciliation (5% vs mock 10%) (OQ-2); admin menu CRUD.
- **FU-4:** admin-orders "Hapus" → soft-archive (`archivedAt`) Admin-only + integration proof (OQ-5).
- **FU-5:** payment/settlement domain.
