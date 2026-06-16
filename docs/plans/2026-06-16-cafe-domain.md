# Plan — I-022 Cafe domain (DB-backed menu + order lifecycle)

- Spec: `docs/specs/0003-cafe-domain.spec.md` · ADRs: 0011 (discount seam), 0012 (order code) · Pyramid: ADR-0010.
- Reuses: `lib/db/client.ts` (Prisma singleton), `lib/db/users.ts` (repo pattern), `lib/auth/session.ts`
  (`requireSession`/`getSessionUser` — the `orgId` seam), `lib/format.ts` (`formatRupiah`), the integration harness
  (`vitest.setup.int.ts`, `*.int.test.ts`, TRUNCATE lifecycle in `lib/db/users.int.test.ts`).
- **Discipline:** TDD red-green per task. Write the failing test, run the exact verify command to see it RED, then
  implement to GREEN. The implementer writes the test in the same task before the prod code. eng-planner writes ONLY
  under `docs/`; the paths below are the implementer's targets.
- **Sequencing:** Phase A (schema+seed) → Phase B (pure logic, unit) → Phase C (repository, integration) →
  Phase D (server actions + authz, integration) → Phase E (surface wiring, unit/static) → Phase F (one curated e2e).
  Phases A–C can land before any UI changes; the vertical ships safely in slices.

> **Type contract (consistent across all tasks).** Define once in `lib/cafe/types.ts`, imported everywhere:
> ```ts
> // lib/cafe/types.ts
> import type { CafeCategory, CafeOrderStatus, DrinkTemperature, SugarLevel } from "@prisma/client";
> export type { CafeCategory, CafeOrderStatus, DrinkTemperature, SugarLevel };
>
> /** A requested order line BEFORE pricing/persistence (client sends menuItemId + qty + optional variant). */
> export interface OrderLineInput {
>   menuItemId: string;
>   qty: number;
>   temperature?: DrinkTemperature | null;
>   sugar?: SugarLevel | null;
> }
> /** A priced line: menu price snapshotted server-side. */
> export interface PricedLine {
>   menuItemId: string;
>   nameSnapshot: string;
>   qty: number;
>   unitPriceRupiah: number;
>   temperature?: DrinkTemperature | null;
>   sugar?: SugarLevel | null;
> }
> export interface OrderTotals { subtotalRupiah: number; discountRupiah: number; totalRupiah: number; }
> ```

---

## Phase A — Schema + migration + seed

### A1. Add cafe models + enums to the Prisma schema
- **File:** `prisma/schema.prisma` (append; also add back-relations on `Organization` and `AppUser`).
- **Change (exact):** add enums and models —
  ```prisma
  enum CafeCategory { COFFEE NON_COFFEE FOOD SNACK }
  enum CafeOrderStatus { NEW PREPARING READY COMPLETED CANCELLED }
  enum DrinkTemperature { HOT COLD ICE_BLENDED }
  enum SugarLevel { NORMAL LESS NONE }

  model CafeMenuItem {
    id          String       @id @default(cuid())
    orgId       String       @map("org_id")
    name        String
    emoji       String
    category    CafeCategory
    priceRupiah Int          @map("price_rupiah")
    description String
    hasVariants Boolean      @default(false) @map("has_variants")
    available   Boolean      @default(true)
    archivedAt  DateTime?    @map("archived_at")
    createdAt   DateTime     @default(now()) @map("created_at")
    updatedAt   DateTime     @updatedAt @map("updated_at")
    organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
    orderItems   CafeOrderItem[]
    @@index([orgId])
    @@index([orgId, category])
    @@map("cafe_menu_items")
  }

  model CafeOrder {
    id             String          @id @default(cuid())
    orgId          String          @map("org_id")
    code           String
    customerUserId String?         @map("customer_user_id")
    guestName      String?         @map("guest_name")
    status         CafeOrderStatus @default(NEW)
    subtotalRupiah Int             @map("subtotal_rupiah")
    discountRupiah Int             @default(0) @map("discount_rupiah")
    totalRupiah    Int             @map("total_rupiah")
    createdAt      DateTime        @default(now()) @map("created_at")
    updatedAt      DateTime        @updatedAt @map("updated_at")
    organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
    customer     AppUser?     @relation(fields: [customerUserId], references: [id], onDelete: SetNull)
    items        CafeOrderItem[]
    @@unique([orgId, code])
    @@index([orgId])
    @@index([orgId, status])
    @@index([orgId, createdAt])
    @@map("cafe_orders")
  }

  model CafeOrderItem {
    id              String            @id @default(cuid())
    orderId         String            @map("order_id")
    menuItemId      String?           @map("menu_item_id")
    nameSnapshot    String            @map("name_snapshot")
    qty             Int
    unitPriceRupiah Int               @map("unit_price_rupiah")
    temperature     DrinkTemperature?
    sugar           SugarLevel?
    order    CafeOrder     @relation(fields: [orderId], references: [id], onDelete: Cascade)
    menuItem CafeMenuItem? @relation(fields: [menuItemId], references: [id], onDelete: SetNull)
    @@index([orderId])
    @@map("cafe_order_items")
  }
  ```
  Add to `model Organization`: `cafeMenuItems CafeMenuItem[]` and `cafeOrders CafeOrder[]`.
  Add to `model AppUser`: `cafeOrders CafeOrder[]`.
- **Verify:** `pnpm prisma validate` exits 0. (Covers FR-100, FR-110, FR-120.)

### A2. Generate the reversible migration + regenerate client
- **Command:** `pnpm prisma migrate dev --name cafe_domain` (against the local/dev throwaway DB per `docs/environments.md`).
- **Verify:** `ls prisma/migrations | grep cafe_domain` shows a new dir; `pnpm prisma generate` exits 0;
  the migration `down`/rollback is reversible (only `CREATE TABLE`/`CREATE TYPE` — no destructive ops on existing
  tables). (FR-100, FR-110, FR-120.)

### A3. Seed the captured menu (idempotent, masked)
- **File:** `prisma/seed.ts` (extend `main()` after the users loop).
- **Change (exact):** import the masked menu mapping and upsert each item into `org.id`. Add:
  ```ts
  const CATEGORY_MAP = {
    Coffee: "COFFEE", "Non-Coffee": "NON_COFFEE", Food: "FOOD", Snack: "SNACK",
  } as const;
  // 16 items copied from lib/mock/cafe.ts (id,name,emoji,category,price,description,hasVariants):
  const MENU = [
    { id: "americano", name: "Americano", emoji: "☕", category: "Coffee", price: 25000, description: "Espresso dengan air panas, pahit yang bersih.", hasVariants: true },
    // … all 16 rows verbatim from lib/mock/cafe.ts (americano, latte, cappuccino, espresso, matcha,
    //   chocolate, orange-juice, lemon-tea, tempe-orek, croissant, sandwich, salad, nasi-rames,
    //   mie-goreng, tahu-goreng, chicken-wings) …
  ];
  for (const m of MENU) {
    const id = `${org.id}__${m.id}`; // deterministic id → idempotent upsert
    await prisma.cafeMenuItem.upsert({
      where: { id },
      update: {},
      create: {
        id, orgId: org.id, name: m.name, emoji: m.emoji,
        category: CATEGORY_MAP[m.category as keyof typeof CATEGORY_MAP],
        priceRupiah: m.price, description: m.description, hasVariants: m.hasVariants,
      },
    });
  }
  console.log(`Seeded ${MENU.length} cafe menu items.`);
  ```
- **Verify:** `pnpm db:seed` (run twice) succeeds and is idempotent;
  `pnpm prisma studio` (or a one-off query) shows 16 `cafe_menu_items` for the org. (FR-103.)

---

## Phase B — Pure domain logic (UNIT)

### B1. Status machine — `nextStatus` (RED→GREEN) — **AC-120**
- **Test first:** `lib/cafe/status.test.ts`
  ```ts
  import { describe, it, expect } from "vitest";
  import { nextStatus } from "@/lib/cafe/status";
  describe("nextStatus", () => {
    it("AC-120: advances NEW→PREPARING→READY→COMPLETED then stops", () => {
      expect(nextStatus("NEW")).toBe("PREPARING");
      expect(nextStatus("PREPARING")).toBe("READY");
      expect(nextStatus("READY")).toBe("COMPLETED");
      expect(nextStatus("COMPLETED")).toBeNull();
      expect(nextStatus("CANCELLED")).toBeNull();
    });
  });
  ```
- **Implement:** `lib/cafe/status.ts` →
  ```ts
  import type { CafeOrderStatus } from "@prisma/client";
  const FORWARD: Partial<Record<CafeOrderStatus, CafeOrderStatus>> = {
    NEW: "PREPARING", PREPARING: "READY", READY: "COMPLETED",
  };
  export function nextStatus(s: CafeOrderStatus): CafeOrderStatus | null {
    return FORWARD[s] ?? null;
  }
  ```
- **Verify:** `pnpm vitest run lib/cafe/status.test.ts`. (FR-120 / AC-120.)

### B2. Order-code generator (format + RNG-injectable) — supports AC-112/ADR-0012
- **Test first:** `lib/cafe/status.test.ts` (add a block)
  ```ts
  import { generateOrderCode } from "@/lib/cafe/status";
  it("generateOrderCode returns 6 lowercase base36 chars", () => {
    const code = generateOrderCode(() => 0.5);
    expect(code).toMatch(/^[0-9a-z]{6}$/);
  });
  it("generateOrderCode varies with the RNG", () => {
    expect(generateOrderCode(() => 0)).not.toBe(generateOrderCode(() => 0.999999));
  });
  ```
- **Implement (add to `lib/cafe/status.ts`):**
  ```ts
  export function generateOrderCode(rng: () => number = Math.random): string {
    const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
    let out = "";
    for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
    return out;
  }
  ```
- **Verify:** `pnpm vitest run lib/cafe/status.test.ts`. (FR-114 / ADR-0012.)

### B3. Pricing — `computeOrderTotals` (subtotal/discount/total) — **AC-110, AC-111**
- **Test first:** `lib/cafe/pricing.test.ts`
  ```ts
  import { describe, it, expect } from "vitest";
  import { computeOrderTotals } from "@/lib/cafe/pricing";
  import type { PricedLine } from "@/lib/cafe/types";
  const lines: PricedLine[] = [
    { menuItemId: "latte", nameSnapshot: "Latte", qty: 1, unitPriceRupiah: 32000 },
    { menuItemId: "croissant", nameSnapshot: "Croissant", qty: 2, unitPriceRupiah: 25000 },
  ];
  describe("computeOrderTotals", () => {
    it("AC-110: no discount → subtotal=total, discount=0", () => {
      expect(computeOrderTotals(lines, { discountEligible: false }))
        .toEqual({ subtotalRupiah: 82000, discountRupiah: 0, totalRupiah: 82000 });
    });
    it("AC-111: eligible → 5% rounded discount", () => {
      expect(computeOrderTotals(lines, { discountEligible: true }))
        .toEqual({ subtotalRupiah: 82000, discountRupiah: 4100, totalRupiah: 77900 });
    });
  });
  ```
- **Implement:** `lib/cafe/pricing.ts` →
  ```ts
  import type { OrderTotals, PricedLine } from "@/lib/cafe/types";
  export const MEMBER_DISCOUNT_RATE = 0.05; // ADR-0011 (OBS-070)
  export function computeOrderTotals(
    lines: PricedLine[], opts: { discountEligible: boolean },
  ): OrderTotals {
    const subtotalRupiah = lines.reduce((s, l) => s + l.unitPriceRupiah * l.qty, 0);
    const discountRupiah = opts.discountEligible
      ? Math.round(subtotalRupiah * MEMBER_DISCOUNT_RATE) : 0;
    return { subtotalRupiah, discountRupiah, totalRupiah: subtotalRupiah - discountRupiah };
  }
  ```
- **Verify:** `pnpm vitest run lib/cafe/pricing.test.ts`. (FR-111, FR-112, NFR-100 / AC-110, AC-111.)

### B4. Discount-eligibility resolver (dormant) — ADR-0011 seam
- **Test first:** `lib/cafe/eligibility.test.ts`
  ```ts
  import { describe, it, expect } from "vitest";
  import { resolveDiscountEligibility } from "@/lib/cafe/eligibility";
  describe("resolveDiscountEligibility (ADR-0011: dormant until booking)", () => {
    it("returns false for a guest (no session)", async () => {
      expect(await resolveDiscountEligibility(null)).toBe(false);
    });
    it("returns false for a member (no booking domain yet)", async () => {
      expect(await resolveDiscountEligibility({ id: "u1", role: "MEMBER", orgId: "o1" })).toBe(false);
    });
  });
  ```
- **Implement:** `lib/cafe/eligibility.ts` →
  ```ts
  import type { Role } from "@prisma/client";
  type SessionUser = { id: string; role: Role; orgId: string } | null;
  /** ADR-0011: server-resolved. Dormant (always false) until the booking domain exists. */
  export async function resolveDiscountEligibility(_user: SessionUser): Promise<boolean> {
    return false;
  }
  ```
- **Verify:** `pnpm vitest run lib/cafe/eligibility.test.ts`. (FR-112 / ADR-0011.)

---

## Phase C — Repository seam `lib/db/cafe.ts` (INTEGRATION, real test Postgres)

> All Phase C/D integration tests follow `lib/db/users.int.test.ts`: dedicated `testPrisma` on `TEST_DATABASE_URL`,
> `TRUNCATE … RESTART IDENTITY CASCADE` in `beforeAll`/`afterAll` (extend the truncate list to
> `"cafe_order_items","cafe_orders","cafe_menu_items","app_users","organizations"`), seed two orgs.

### C1. `listMenu` is org-scoped + available-only — **AC-100**
- **Test first:** `lib/db/cafe.int.test.ts` (new) — seed org A with 2 available + 1 `available:false` + 1 `archivedAt`
  item, org B with 1 item.
  ```ts
  it("AC-100: listMenu returns only orgA available, non-archived items, sorted", async () => {
    const items = await listMenu(orgAId);
    expect(items.every((i) => i.orgId === orgAId)).toBe(true);
    expect(items.map((i) => i.name)).not.toContain("HiddenItem");   // available:false
    expect(items.map((i) => i.name)).not.toContain("ArchivedItem"); // archivedAt set
    expect(items.map((i) => i.name)).not.toContain("OrgBItem");     // cross-org
  });
  ```
- **Implement:** `lib/db/cafe.ts` →
  ```ts
  import { prisma } from "@/lib/db/client";
  export function listMenu(orgId: string) {
    return prisma.cafeMenuItem.findMany({
      where: { orgId, archivedAt: null, available: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  }
  ```
- **Verify:** `pnpm vitest run lib/db/cafe.int.test.ts -t AC-100`. (FR-101, FR-103 / AC-100.)

### C2. `createOrder` — server-priced, org-scoped, member customer — **AC-112, AC-125**
- **Test first (add to `lib/db/cafe.int.test.ts`):**
  ```ts
  it("AC-112: createOrder persists member order with server totals + NEW + unique code", async () => {
    const order = await createOrder({
      orgId: orgAId,
      customerUserId: aUserId,
      guestName: null,
      lines: [{ menuItemId: latteAId, qty: 1 }, { menuItemId: croissantAId, qty: 2 }],
      discountEligible: false,
    });
    expect(order.orgId).toBe(orgAId);
    expect(order.customerUserId).toBe(aUserId);
    expect(order.guestName).toBeNull();
    expect(order.status).toBe("NEW");
    expect(order.subtotalRupiah).toBe(82000);
    expect(order.totalRupiah).toBe(82000);
    expect(order.code).toMatch(/^[0-9a-z]{6}$/);
    const items = await testPrisma.cafeOrderItem.findMany({ where: { orderId: order.id } });
    expect(items.find((i) => i.menuItemId === latteAId)?.unitPriceRupiah).toBe(32000);
    expect(items.find((i) => i.menuItemId === latteAId)?.nameSnapshot).toBe("Latte");
  });
  it("AC-125: createOrder rejects a menuItemId from another org (no cross-org pricing)", async () => {
    await expect(createOrder({ orgId: orgAId, customerUserId: aUserId, guestName: null,
      lines: [{ menuItemId: orgBItemId, qty: 1 }], discountEligible: false })).rejects.toThrow();
  });
  ```
- **Implement (add to `lib/db/cafe.ts`):** look up each line's menu item **within `orgId`** (reject unknown/cross-org),
  snapshot name+price, call `computeOrderTotals`, generate a code, insert order+items in one
  `prisma.$transaction`; on `code` unique-violation retry up to 5× (ADR-0012). Signature:
  ```ts
  import { computeOrderTotals } from "@/lib/cafe/pricing";
  import { generateOrderCode } from "@/lib/cafe/status";
  import type { OrderLineInput } from "@/lib/cafe/types";
  export async function createOrder(input: {
    orgId: string; customerUserId: string | null; guestName: string | null;
    lines: OrderLineInput[]; discountEligible: boolean;
  }) { /* … as described … */ }
  ```
- **Verify:** `pnpm vitest run lib/db/cafe.int.test.ts -t AC-112` and `-t AC-125`.
  (FR-111, FR-112, FR-114, FR-115 / AC-112, AC-125.)

### C3. `createOrder` — guest path (name captured, no discount) — **AC-113, AC-114**
- **Test first (add):**
  ```ts
  it("AC-113: guest order captures name, no discount, customerUserId null", async () => {
    const o = await createOrder({ orgId: orgAId, customerUserId: null, guestName: "Sari",
      lines: [{ menuItemId: latteAId, qty: 1 }], discountEligible: false });
    expect(o.guestName).toBe("Sari");
    expect(o.customerUserId).toBeNull();
    expect(o.discountRupiah).toBe(0);
    expect(o.totalRupiah).toBe(o.subtotalRupiah);
  });
  it("AC-114: order with zero valid lines is rejected, no write", async () => {
    const before = await testPrisma.cafeOrder.count({ where: { orgId: orgAId } });
    await expect(createOrder({ orgId: orgAId, customerUserId: null, guestName: "X",
      lines: [], discountEligible: false })).rejects.toThrow();
    expect(await testPrisma.cafeOrder.count({ where: { orgId: orgAId } })).toBe(before);
  });
  ```
- **Implement:** in `createOrder`, throw before any write when `lines` resolves to zero valid items (guard at top).
  (Guest name validation — non-empty — is enforced in the server action D1, not the repo.)
- **Verify:** `pnpm vitest run lib/db/cafe.int.test.ts -t AC-113` and `-t AC-114`. (FR-113, FR-114 / AC-113, AC-114.)

### C4. `advanceOrderStatus` — forward step, org-scoped — **AC-122, AC-124**
- **Test first (add):**
  ```ts
  it("AC-122: advanceOrderStatus walks NEW→PREPARING→READY→COMPLETED then rejects", async () => {
    const o = await createOrder({ orgId: orgAId, customerUserId: aUserId, guestName: null,
      lines: [{ menuItemId: latteAId, qty: 1 }], discountEligible: false });
    expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("PREPARING");
    expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("READY");
    expect((await advanceOrderStatus(orgAId, o.id)).status).toBe("COMPLETED");
    await expect(advanceOrderStatus(orgAId, o.id)).rejects.toThrow();
  });
  it("AC-124: advanceOrderStatus on a cross-org order forbids, no write", async () => {
    const oB = await createOrder({ orgId: orgBId, customerUserId: bUserId, guestName: null,
      lines: [{ menuItemId: orgBItemId, qty: 1 }], discountEligible: false });
    await expect(advanceOrderStatus(orgAId, oB.id)).rejects.toThrow();
    const fresh = await testPrisma.cafeOrder.findUnique({ where: { id: oB.id } });
    expect(fresh?.status).toBe("NEW");
  });
  ```
- **Implement (add to `lib/db/cafe.ts`):**
  ```ts
  import { nextStatus } from "@/lib/cafe/status";
  export async function advanceOrderStatus(orgId: string, id: string) {
    const order = await prisma.cafeOrder.findFirst({ where: { id, orgId } });
    if (!order) throw new Error("NOT_FOUND");
    const next = nextStatus(order.status);
    if (!next) throw new Error("INVALID_TRANSITION");
    return prisma.cafeOrder.update({ where: { id: order.id }, data: { status: next } });
  }
  ```
- **Verify:** `pnpm vitest run lib/db/cafe.int.test.ts -t AC-122` and `-t AC-124`.
  (FR-120, FR-121, FR-123 / AC-122, AC-124.)

### C5. `listOrders` / `getOrder` / `setOrderStatus` — org-scoped reads + admin set — **AC-125**
- **Test first (add):**
  ```ts
  it("AC-125: listOrders returns only the caller org's orders, newest first", async () => {
    const aOrders = await listOrders(orgAId);
    expect(aOrders.every((o) => o.orgId === orgAId)).toBe(true);
  });
  it("listOrders filters by status set", async () => {
    const kds = await listOrders(orgAId, { statuses: ["NEW", "PREPARING", "READY"] });
    expect(kds.every((o) => ["NEW","PREPARING","READY"].includes(o.status))).toBe(true);
  });
  ```
- **Implement (add to `lib/db/cafe.ts`):**
  ```ts
  import type { CafeOrderStatus } from "@prisma/client";
  export function listOrders(orgId: string, opts?: { statuses?: CafeOrderStatus[]; limit?: number }) {
    return prisma.cafeOrder.findMany({
      where: { orgId, ...(opts?.statuses ? { status: { in: opts.statuses } } : {}) },
      include: { items: true }, orderBy: { createdAt: "desc" }, take: opts?.limit,
    });
  }
  export function getOrder(orgId: string, id: string) {
    return prisma.cafeOrder.findFirst({ where: { id, orgId }, include: { items: true } });
  }
  export async function setOrderStatus(orgId: string, id: string, status: CafeOrderStatus) {
    const order = await prisma.cafeOrder.findFirst({ where: { id, orgId } });
    if (!order) throw new Error("NOT_FOUND");
    return prisma.cafeOrder.update({ where: { id: order.id }, data: { status } });
  }
  ```
- **Verify:** `pnpm vitest run lib/db/cafe.int.test.ts -t AC-125`. (FR-124, FR-130, FR-131 / AC-125.)

---

## Phase D — Server actions + server-side authz (INTEGRATION)

### D1. `placeOrder` server action (member + guest), name validation
- **File:** `app/cafe/actions.ts` (`"use server"`).
- **Implement:**
  ```ts
  "use server";
  import { getSessionUser } from "@/lib/auth/session";
  import { resolveDiscountEligibility } from "@/lib/cafe/eligibility";
  import { createOrder } from "@/lib/db/cafe";
  import type { OrderLineInput } from "@/lib/cafe/types";
  const SEED_ORG_FALLBACK = process.env.SEED_ORG_SLUG ?? "flowspace";
  export async function placeOrder(input: { lines: OrderLineInput[]; guestName?: string }) {
    const user = await getSessionUser();
    if (user) {
      const discountEligible = await resolveDiscountEligibility(user);
      return createOrder({ orgId: user.orgId, customerUserId: user.id, guestName: null,
        lines: input.lines, discountEligible });
    }
    const guestName = (input.guestName ?? "").trim();
    if (!guestName) throw new Error("GUEST_NAME_REQUIRED");
    const orgId = await resolveGuestOrgId(SEED_ORG_FALLBACK); // org lookup by slug, server-side
    return createOrder({ orgId, customerUserId: null, guestName, lines: input.lines, discountEligible: false });
  }
  ```
  (Guests have no session/org; resolve the single venue org server-side by slug — never from the client. Add
  `resolveGuestOrgId` querying `prisma.organization.findUnique({ where: { slug } })`.)
- **Test (add to `lib/db/cafe.int.test.ts` or `app/cafe/actions.int.test.ts`):** assert the empty-guest-name throw and
  that a member call routes `customerUserId`. (Covered behaviorally by C2/C3; this task adds the name-required guard
  test — reuses AC-114 oracle.)
- **Verify:** `pnpm vitest run -t AC-114` still green; `pnpm typecheck`. (FR-111, FR-112, FR-113.)

### D2. Barista/admin status mutation actions + **server-side role gate** — **AC-123**
- **Files:** `app/barista/actions.ts`, `app/(admin)/admin/orders/actions.ts` (`"use server"`).
- **Test first:** `lib/cafe/authz.int.test.ts` (or in `cafe.int.test.ts`) — drive the action with a faked session.
  Use a small `assertCanMutateOrders(role)` helper so the deny is unit-provable too:
  - **Unit-style guard test** `lib/cafe/authz.test.ts`:
    ```ts
    import { canMutateOrderStatus } from "@/lib/cafe/authz";
    it("AC-123: MEMBER cannot mutate order status; BARISTA/ADMIN can", () => {
      expect(canMutateOrderStatus("MEMBER")).toBe(false);
      expect(canMutateOrderStatus("BARISTA")).toBe(true);
      expect(canMutateOrderStatus("ADMIN")).toBe(true);
    });
    ```
  - **Integration proof (no write)** in `cafe.int.test.ts`:
    ```ts
    it("AC-123: a MEMBER-role action call does not change status (server-side deny, no write)", async () => {
      const o = await createOrder({ orgId: orgAId, customerUserId: aUserId, guestName: null,
        lines: [{ menuItemId: latteAId, qty: 1 }], discountEligible: false });
      await expect(advanceOrderStatusAsActor({ id: aUserId, role: "MEMBER", orgId: orgAId }, o.id))
        .rejects.toThrow(/FORBIDDEN/);
      const fresh = await testPrisma.cafeOrder.findUnique({ where: { id: o.id } });
      expect(fresh?.status).toBe("NEW");
    });
    ```
- **Implement:**
  - `lib/cafe/authz.ts`: `export function canMutateOrderStatus(role: Role) { return role === "BARISTA" || role === "ADMIN"; }`
  - In each action: `const u = await requireSession(); if (!canMutateOrderStatus(u.role)) throw new Error("FORBIDDEN"); return advanceOrderStatus(u.orgId, id);`
    (barista action calls `advanceOrderStatus`; admin orders action additionally exposes `setStatus` gated on
    `u.role === "ADMIN"` → `setOrderStatus`). Export a thin `advanceOrderStatusAsActor(actor, id)` test seam that
    performs the same role check + `advanceOrderStatus(actor.orgId, id)` so the integration test can drive it without
    mocking NextAuth.
- **Verify:** `pnpm vitest run lib/cafe/authz.test.ts` and `pnpm vitest run lib/db/cafe.int.test.ts -t AC-123`.
  (FR-121, FR-122, FR-123 / AC-123.)

---

## Phase E — Wire the surfaces (read DB; submit via actions). No restyle. (UNIT + static)

> Strategy: convert each page's data source from `lib/mock/cafe` to a server-component wrapper that reads
> `listMenu(orgId)` / `listOrders(orgId)` and passes data as props into the **existing** client component (extracted
> with its current markup intact). The unit test asserts the client component renders the **passed** data; a static
> grep gate asserts the mock import is gone.

### E1. Member `/cafe` reads DB menu — **AC-101 (render)** + AC-102 wiring
- **Files:** split `app/(member)/cafe/page.tsx` into a server `page.tsx` (calls `requireSession` → `listMenu(orgId)`,
  passes `menu` + `recentOrder` props) and a client `CafeClient.tsx` (current JSX, prop-driven; checkout calls
  `placeOrder`). Map DB `CafeMenuItem` → the existing `MenuItem` view shape (category enum → label) in the server file.
- **Test first:** `app/(member)/cafe/CafeClient.test.tsx` (RTL, jsdom)
  ```tsx
  it("AC-101: renders the menu items passed as props (DB-sourced)", () => {
    render(<CafeClient menu={[{ id: "x", name: "Latte", emoji: "🥛", category: "Coffee",
      price: 32000, description: "d", hasVariants: true }]} recentOrder={null} hasActiveSession={false} />);
    expect(screen.getByText("Latte")).toBeInTheDocument();
    expect(screen.getByText("Rp 32.000")).toBeInTheDocument();
  });
  ```
- **Verify:** `pnpm vitest run app/(member)/cafe/CafeClient.test.tsx`;
  static gate `! grep -rq "lib/mock/cafe" "app/(member)/cafe/"` (no mock import remains). (FR-102 / AC-101.)

### E2. Guest `/cafe/guest` reads DB menu + submits real order
- **Files:** split `app/(public)/cafe/guest/page.tsx` into server `page.tsx` (`listMenu` for the seeded org, no
  session) + client `GuestCafeClient.tsx` (current JSX; `handleConfirmOrder` calls `placeOrder({ lines, guestName })`).
- **Test first:** `app/(public)/cafe/guest/GuestCafeClient.test.tsx` — renders passed `menu`, shows an item.
- **Verify:** `pnpm vitest run "app/(public)/cafe/guest/GuestCafeClient.test.tsx"`;
  static gate `! grep -rq "lib/mock/cafe" "app/(public)/cafe/guest/"`. (FR-102.)

### E3. Admin `/admin/pos` reads DB menu (read-only menu; checkout dormant per OQ-2)
- **Files:** split `app/(admin)/admin/pos/page.tsx` server (`requireSession` ADMIN → `listMenu`) + client.
  Keep the `DISPLAY_NAMES`/`HIDDEN_IDS` FE overrides; map DB rows in. POS checkout stays dormant (OQ-2/FU-3) — no
  server write wired this issue; leave the existing button inert.
- **Test first:** `app/(admin)/admin/pos/PosClient.test.tsx` — renders a passed item row + price.
- **Verify:** `pnpm vitest run "app/(admin)/admin/pos/PosClient.test.tsx"`;
  static gate `! grep -rq "lib/mock/cafe" "app/(admin)/admin/pos/"`. (FR-102.)

### E4. Barista `/barista` reads DB orders + advances via action
- **Files:** split `app/barista/page.tsx` server (`requireSession`, role∈{BARISTA,ADMIN} already gated by middleware
  → `listOrders(orgId, { statuses: ["NEW","PREPARING","READY"] })`, map to `BaristaOrder` view shape) + client
  `BaristaClient.tsx` (current JSX; `handleAdvance` calls the barista action then `router.refresh()`; "Refresh" button
  → `router.refresh()` per ADR-0004/OQ-4). Map `CafeOrder.status` enum → the FE's lowercase `OrderStatus`.
- **Test first:** `app/barista/BaristaClient.test.tsx` — given one NEW order prop, the "Pesanan Baru (1)" column shows
  the order code + line.
- **Verify:** `pnpm vitest run app/barista/BaristaClient.test.tsx`;
  static gate `! grep -rq "lib/mock/barista" app/barista/`. (FR-130 / supports AC-121.)

### E5. Admin `/admin/orders` lists DB orders + status set via action
- **Files:** split `app/(admin)/admin/orders/page.tsx` server (`requireSession` ADMIN → `listOrders(orgId)`, map to
  the `AdminOrder` view shape incl. computed subtotal/discount/total from persisted fields) + client. The status
  `<select>` `onChange` calls the admin `setStatus` action → `router.refresh()`. "Hapus" stays dormant (OQ-5/FU).
- **Test first:** `app/(admin)/admin/orders/OrdersClient.test.tsx` — renders a passed order row (code, total,
  status badge) and the filter narrows by status.
- **Verify:** `pnpm vitest run "app/(admin)/admin/orders/OrdersClient.test.tsx"`. (FR-124, FR-130.)

---

## Phase F — One curated E2E — **AC-121**

### F1. Member places an order → it appears in the barista KDS as NEW
- **File:** `e2e/AC-121-member-order-to-kds.spec.ts`
  ```ts
  test("AC-121 member order appears in the barista KDS as NEW", async ({ browser }) => {
    // 1) member context: login as budi, go to /cafe, add a no-variant item (e.g. Croissant), checkout.
    // 2) capture the order presence (member sees confirmation / Pesanan Terakhir).
    // 3) barista context: login as the seeded barista, open /barista,
    //    assert the NEW column ("Pesanan Baru") contains the just-placed order's line/code.
  });
  ```
  Use the seeded creds (`budi@flowspace.test`/`dev-member-pw`, `barista@flowspace.test`/`dev-barista-pw`) and the
  `loginAs` helper pattern from `e2e/AC-010-server-side-authz.spec.ts`. Two browser contexts (member, barista).
- **Verify:** `pnpm e2e e2e/AC-121-member-order-to-kds.spec.ts` (against a seeded test DB). (FR-114, FR-130 / AC-121.)

---

## Final gates (run before review hand-off)
- `pnpm typecheck` → 0 errors.
- `pnpm lint:ci` → 0 errors/warnings.
- `pnpm vitest run` (unit + integration projects) → all green; changed-code coverage ≥80%.
- `pnpm e2e` → AC-121 green (plus the existing suite).
- `pnpm build` → green (server/client split compiles; no `lib/mock/cafe` import remains on the wired surfaces).

## Traceability table (AC → owning layer → owning test)
| AC | Owning layer | Owning test (title token / file) | FR |
|----|--------------|----------------------------------|----|
| AC-100 | Integration | `cafe.int.test.ts` "AC-100: listMenu …" | FR-101, FR-103 |
| AC-101 | Unit (RTL) | `CafeClient.test.tsx` "AC-101: renders the menu …" (+ static no-mock-import gate) | FR-102 |
| AC-110 | Unit | `pricing.test.ts` "AC-110: no discount …" | FR-111 |
| AC-111 | Unit | `pricing.test.ts` "AC-111: eligible → 5% …" | FR-112, NFR-100 |
| AC-112 | Integration | `cafe.int.test.ts` "AC-112: createOrder persists member …" | FR-111/112/114/115 |
| AC-113 | Integration | `cafe.int.test.ts` "AC-113: guest order captures name …" | FR-113, FR-114 |
| AC-114 | Integration | `cafe.int.test.ts` "AC-114: zero valid lines rejected …" | FR-113, FR-114 |
| AC-120 | Unit | `status.test.ts` "AC-120: advances NEW→…" | FR-120 |
| AC-121 | E2E | `e2e/AC-121-member-order-to-kds.spec.ts` | FR-114, FR-130 |
| AC-122 | Integration | `cafe.int.test.ts` "AC-122: advanceOrderStatus walks …" | FR-120/121/123 |
| AC-123 | Integration (+unit guard) | `cafe.int.test.ts` "AC-123: MEMBER action no write …" (+ `authz.test.ts`) | FR-122 |
| AC-124 | Integration | `cafe.int.test.ts` "AC-124: cross-org advance forbids …" | FR-123 |
| AC-125 | Integration | `cafe.int.test.ts` "AC-125: listOrders/createOrder org-scoped …" | FR-115, FR-130 |

## Follow-ups (out of scope, tracked)
- **FU-1:** real-time KDS push (websocket/SSE) — replaces `router.refresh()` polling (OQ-4).
- **FU-2:** booking/“active session” domain → flips `resolveDiscountEligibility` to apply the dormant 5% (OQ-1, ADR-0011).
- **FU-3:** POS checkout write + member-discount-rate reconciliation (5% vs mock 10%) (OQ-2); admin menu CRUD.
- **FU-4:** admin-orders "Hapus" → soft-archive (`archivedAt`) Admin-only + integration proof (OQ-5).
- **FU-5:** payment/settlement domain.
