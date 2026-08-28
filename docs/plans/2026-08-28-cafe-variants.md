# Plan — I-044 Cafe nuances parity

- **Spec:** `docs/specs/0010-cafe-variants.spec.md` (signed off; FR-720..729, NFR-044-01..04, AC-700..729).
- **Issue:** I-044.
- **Migration claim:** `0015` — this issue merges after I-041/I-040/I-043; run the renumber-check at release. Do **not** claim `0010`–`0014`.
- **ADR:** none.
- **Stack:** Supabase Postgres DDL in `supabase/migrations/`, Drizzle query mirror in `lib/db/schema.ts`, repositories in `lib/db/*`, server actions at the route boundary, Vitest unit/integration ownership per ADR-0010.
- **Verification convention:** integration tests require the Supabase CLI local stack and `TEST_DATABASE_URL`/`DATABASE_URL` pointed at it; migration verification is `pnpm exec supabase db reset`.

## Design

### Decisions and data flow

1. `cafe_menu_items.variant_config` stores nullable JSONB with the exact runtime shape `{ variants: [{ name, required, options: [{ name, priceAdjustment }] }] }`. `lib/cafe/variants.ts` parses and validates it; malformed JSON, duplicate group/option names, negative/non-integer adjustments, unknown selections, missing required groups, and options on `hasVariants=false` items all fail before the repository transaction.
2. `lib/cafe/pricing.ts` receives live, org-scoped menu rows and `OrderLineInput` selections. It resolves each option adjustment from the live config, computes `unitPriceRupiah`, and returns ordered `variantOptions` snapshots. Client unit prices, subtotals, discounts, and adjustment fields are not part of the trusted input and are ignored if extra runtime properties are supplied.
3. `cafe_order_items.variant_options` is the canonical new-write representation: `[{ variantName, optionName, priceAdjustmentRupiah }]`. The legacy `temperature`/`sugar` columns remain nullable and are not used for new pricing. `cafe_orders.notes` is normalized by `normalizeOrderNotes`: trim, blank→`null`, Unicode-code-point length >500→`INVALID_NOTES`; the database repeats the 500-character check.
4. `createOrder` remains the single atomic repository boundary for order, item, and transaction rows. It takes a server-derived `orgId`, selects only available/non-archived menu rows within that org, snapshots name/price/options, resolves the configured tier discount server-side, and retains the existing bounded six-character code retry.
5. POS uses `findMemberByEmail(orgId, email)` with a minimal same-org, non-archived, `MEMBER` projection. The ADMIN-only action resolves the member and active booking server-side, calls `resolveDiscountEligibility`, reads that member tier's `cafe_discount_pct`, and passes only server-derived identity/eligibility to `createOrder`. A client user id, price, subtotal, discount, or option adjustment is never accepted as authority.
6. Member, guest, and POS pages receive `variantConfig` from `listMenu`. A shared `[UI]` picker renders arbitrary configured groups, marks required groups, defaults each to its first option, displays adjustments, and submits only `{ variantName, optionName }` selections. Cart keys include the ordered selections so different combinations remain separate lines while identical selections merge.
7. KDS maps `variantOptions` into a display string and renders `notes` in the existing design-system warning treatment (`amber-100`/`amber-700` family). The org-scoped Realtime channel, `NEW → PREPARING → READY → COMPLETED` machine, manual refresh, and bounded order list remain unchanged.

### Performance, tenancy, and operational constraints

- Menu reads stay one bounded org-scoped query; order creation uses one distinct-id menu lookup and one transaction, not one query per line. POS lookup selects only `id`, `name`, `email`, and the data needed for server eligibility display.
- Every repository function takes a server-derived `orgId`; public guest org resolution remains server-side by configured slug. The POS route/action re-checks `ADMIN` in the action even though middleware/layout also gate `/admin`.
- The migration adds no new table, so existing cafe RLS policies, indexes, and Realtime publication remain in place. The parent-order RLS policy continues to scope order items; repository queries retain explicit org predicates.
- No cache is added: menu availability/config and prices are live money-path data. Existing `force-dynamic` guest rendering and server-component refresh behavior are retained.
- UI tasks use the tokens/classes already named in `DESIGN.md`, ship modal/cart/checkout loading, empty, error, keyboard, and mobile states, and do not introduce raw design tokens.

> **Source discrepancy requiring Director confirmation:** the checked-in `scripts/seed-supabase.ts` currently contains 34 menu rows, while FR-729/AC-721 call the current menu 31 items. The plan preserves every existing row and does not delete menu content; the seed test must be finalized against the owner-confirmed 31-versus-34 source list before implementation. This is the only open question.

## TDD implementation tasks

Each behavior task writes the named failing test first, runs the listed command to observe RED, then makes the smallest implementation change and reruns the same command to GREEN. Paths below are implementation targets; this planning document does not edit source or tests.

### Phase 1 — migration and Drizzle mirror

1. **Add migration `0015` for the three JSON/text deltas.**
   - **Files:** `supabase/migrations/0015_cafe_variants.sql`.
   - **Change:** add a header stating that I-044 follows `0009_money_qty_checks.sql`, that I-041/I-040/I-043 may require release renumbering, and that `0015` is the claimed number. Apply:
     ```sql
     ALTER TABLE "cafe_menu_items"
       ADD COLUMN "variant_config" jsonb;

     ALTER TABLE "cafe_orders"
       ADD COLUMN "notes" text;
     ALTER TABLE "cafe_orders"
       ADD CONSTRAINT "cafe_orders_notes_length"
       CHECK ("notes" IS NULL OR char_length("notes") <= 500);

     ALTER TABLE "cafe_order_items"
       ADD COLUMN "variant_options" jsonb NOT NULL DEFAULT '[]'::jsonb;
     ```
     Do not alter the existing cafe RLS policies, Realtime publication, indexes, status enum, code uniqueness, or compatibility columns. Do not add a `_down` file: ADR-0015 documents that Supabase migrations are forward-only.
   - **Verify:** `pnpm exec supabase db reset`.

2. **Mirror the migration in the Drizzle schema.**
   - **Files:** `lib/db/schema.ts`.
   - **Change:** import `jsonb` from `drizzle-orm/pg-core`; import the types from `@/lib/cafe/types` with `import type`; add `variantConfig: jsonb("variant_config").$type<VariantConfig | null>()` to `cafeMenuItems`, `notes: text("notes")` to `cafeOrders`, and `variantOptions: jsonb("variant_options").$type<VariantOptionSnapshot[]>().notNull().default([])` to `cafeOrderItems`. Keep `temperature` and `sugar` unchanged and export the inferred row types.
   - **Verify:** `pnpm typecheck`.

### Phase 2 — pure variant validation and pricing

3. **Define the generic selection/snapshot contract.**
   - **RED test:** add `lib/cafe/variants.test.ts` cases named `AC-700` for a valid config and `AC-705`/`AC-709` for required/unknown/disabled-item rejection.
   - **Files:** `lib/cafe/types.ts`, `lib/cafe/variants.test.ts`.
   - **Change:** replace the new-write reliance on temperature/sugar with these serializable types while retaining the DB enum exports for compatibility:
     ```ts
     export interface VariantOption { name: string; priceAdjustment: number }
     export interface VariantGroup { name: string; required: boolean; options: VariantOption[] }
     export interface VariantConfig { variants: VariantGroup[] }
     export interface VariantSelectionInput { variantName: string; optionName: string }
     export interface VariantOptionSnapshot {
       variantName: string;
       optionName: string;
       priceAdjustmentRupiah: number;
     }
     export interface OrderLineInput {
       menuItemId: string;
       qty: number;
       options?: VariantSelectionInput[] | null;
     }
     ```
     Keep `OrderTotals`; make `PricedLine` carry `variantOptions: VariantOptionSnapshot[]`.
   - **Verify:** `pnpm test:unit -- lib/cafe/variants.test.ts`.

4. **Implement strict config parsing and selection validation.**
   - **Files:** `lib/cafe/variants.ts`, `lib/cafe/variants.test.ts`.
   - **Change:** implement `parseVariantConfig(raw: unknown): VariantConfig` and `validateVariantSelections(item, selections): VariantOptionSnapshot[]`. Require a plain object with a non-empty `variants` array; require non-empty unique group and option names; require integer non-negative `priceAdjustment`; reject duplicate selected groups, missing required groups, unknown groups/options, malformed selections, and any selection/config on `hasVariants=false`. Return snapshots in config-group order, resolving `priceAdjustmentRupiah` from the live config and never from the selection payload. Use sentinels `INVALID_VARIANT_CONFIG`, `INVALID_VARIANTS`, and `MISSING_REQUIRED_VARIANT`.
   - **Verify:** `pnpm test:unit -- lib/cafe/variants.test.ts`.

5. **Make server pricing resolve variants and preserve rounding.**
   - **RED test:** add `AC-703` and `AC-706` to `lib/cafe/pricing.test.ts`; pass a fixture item at `22000` with a `Cold` option at `3000` and a no-variant item at `25000 × 2`, including a forged client adjustment/price in the test input and asserting `75000`.
   - **Files:** `lib/cafe/pricing.ts`, `lib/cafe/pricing.test.ts`.
   - **Change:** add pure `priceOrderLines(menuItems, lines)` that maps live menu rows by id, calls `validateVariantSelections`, computes `unitPriceRupiah = priceRupiah + Σ snapshot.priceAdjustmentRupiah`, and returns name/qty/options snapshots. Keep `computeOrderTotals` as `Math.round(subtotalRupiah * discountPct / 100)`. Reject missing menu ids with `INVALID_MENU_ITEMS`; do not accept `itemPrice`, `unitPriceRupiah`, `subtotalRupiah`, `discountPct`, or `priceAdjustment` as inputs.
   - **Verify:** `pnpm test:unit -- lib/cafe/pricing.test.ts`.

6. **Extract reusable note and quantity guards.**
   - **RED test:** add `AC-712` cases for `undefined`, `"   "`, exactly 500 Unicode code points, and 501 code points; add `AC-725` cases for qty `99` and `100` to `lib/cafe/validation.test.ts`.
   - **Files:** `lib/cafe/validation.ts`, `lib/cafe/validation.test.ts`.
   - **Change:** implement `normalizeOrderNotes(value: unknown): string | null` using `trim()` and `Array.from(trimmed).length`, throwing `INVALID_NOTES` above 500; implement `assertOrderLineQuantity(qty: unknown)` for integer `1..99`, throwing `INVALID_QUANTITY`. Call both before any repository write.
   - **Verify:** `pnpm test:unit -- lib/cafe/validation.test.ts`.

7. **Centralize cart identity/merge behavior.**
   - **RED test:** add `AC-704` to `lib/cafe/cart.test.ts`: Hot and Cold produce two lines, repeated Hot merges quantity, and a same-item no-variant line does not merge with a variant line.
   - **Files:** `lib/cafe/cart.ts`, `lib/cafe/cart.test.ts`, `components/member/cafe/types.ts`.
   - **Change:** implement `cartLineKey(menuItemId, options)` with a stable ordered `variantName=optionName` representation and `addCartLine(lines, line)` that merges only equal keys. Update the member `CartItem` type and existing `cartKey` adapter to use generic selections; guest cart code will call the same helper instead of duplicating temperature/sugar comparisons.
   - **Verify:** `pnpm test:unit -- lib/cafe/cart.test.ts`.

### Phase 3 — order-write path and action inputs

8. **Write generic snapshots and notes through `createOrder`.**
   - **RED test:** extend `lib/db/cafe.int.test.ts` with `AC-707` and `AC-708`: create a variant order, inspect `variant_options`, rename/reprice the menu row, then assert the old `name_snapshot`, `unit_price_rupiah`, and option adjustment remain unchanged.
   - **Files:** `lib/db/cafe.ts`, `lib/db/cafe.int.test.ts`.
   - **Change:** run `assertOrderLineQuantity` and `normalizeOrderNotes` before the menu query; replace the hand-built temperature/sugar pricing map with `priceOrderLines(foundItems, lines)`; insert `variantOptions: pl.variantOptions`, `notes`, the computed unit price, and the name snapshot. Set new `temperature`/`sugar` values to `null`; retain existing code retry and transaction/ledger behavior. Keep the menu query `org_id = orgId AND available = true AND archived_at IS NULL` and distinct-id validation.
   - **Verify:** `pnpm test:int -- lib/db/cafe.int.test.ts`.

9. **Thread notes through the public member/guest action.**
   - **RED test:** add `AC-710`, `AC-711`, and `AC-712` integration cases to `app/cafe/actions.int.test.ts`: guest notes/options persist with no discount; an eligible member gets the configured tier discount and notes; blank/over-limit notes write nothing.
   - **Files:** `app/cafe/actions.ts`, `app/cafe/actions.int.test.ts`.
   - **Change:** extend `placeOrder` input to `{ lines, guestName?, notes? }`; pass `notes` unchanged to the repository so the repository remains the final normalization boundary. Keep member `orgId`, `customerUserId`, and `resolveDiscountEligibility(user)` server-derived; keep guest org lookup by `SEED_ORG_SLUG`, required guest name, and zero discount.
   - **Verify:** `pnpm test:int -- app/cafe/actions.int.test.ts`.

10. **Preserve and tag existing order invariants.**
    - **RED test:** add explicit `AC-723`, `AC-727`, and `AC-728` titles to the existing integration cases, covering member/guest/POS `NEW` semantics, unavailable/archived rows, and forced code-collision retry.
    - **Files:** `lib/db/cafe.int.test.ts`, `lib/cafe/status.test.ts`.
    - **Change:** retain the current five-attempt `(org_id, code)` retry and six-character generation; add the collision test by mocking `generateOrderCode` to return a pre-existing code before a fresh code. Keep all reads/writes explicitly org-scoped.
    - **Verify:** `pnpm test:int -- lib/db/cafe.int.test.ts && pnpm test:unit -- lib/cafe/status.test.ts`.

### Phase 4 — seed update

11. **Add a seed regression test before changing seed behavior.**
    - **RED test:** create `scripts/seed-supabase.int.test.ts` with `AC-721` and `AC-729`; run the seed twice, query the configured org's menu, assert every existing seed slug remains, prices are unchanged, exactly the owner-confirmed Sugar set has `has_variants=true` and the three `+0` options, no row has a Temperature group, and the bottled/soda/water/unsweetened-tea exclusions are non-variant.
    - **Files:** `scripts/seed-supabase.int.test.ts`.
    - **Change:** use the existing integration Postgres connection and invoke the real `pnpm db:seed:supabase` command twice; query by deterministic `<orgId>__<slug>` ids. The expected row count must use the Director-confirmed source list because the checked-in array currently has 34 rows although the signed spec says 31.
    - **Verify:** `pnpm test:int -- scripts/seed-supabase.int.test.ts`.

12. **Make the current seed idempotently add Sugar-only variants.**
    - **Files:** `scripts/seed-supabase.ts`.
    - **Change:** add the shared config and explicit slug set:
      ```ts
      const SUGAR_VARIANT_CONFIG = {
        variants: [{
          name: "Sugar",
          required: true,
          options: [
            { name: "Normal Sugar", priceAdjustment: 0 },
            { name: "Less Sugar", priceAdjustment: 0 },
            { name: "No Sugar", priceAdjustment: 0 },
          ],
        }],
      } as const;

      const SUGAR_VARIANT_SLUGS = new Set([
        "es-kopi-susu-aren", "es-kopi-susu-milo", "butter-scotch-latte",
        "es-kopi-susu", "kopi-susu-panas", "es-kopi-sanger", "kopi-sanger-panas",
        "es-kopi-hitam", "kopi-hitam-panas", "kopi-saring-ijen", "kopi-saring-toraja",
        "kopi-saring-tolu-batak", "kopi-tubruk-ijen", "kopi-tubruk-toraja",
        "kopi-tubruk-tolu-batak", "es-matcha", "matcha-panas", "es-milo",
        "milo-panas", "ice-lychee-tea", "es-teh-manis", "teh-manis-hangat",
      ]);
      ```
      Set each menu object's `hasVariants` and `variantConfig` from that set, preserve all existing row names/prices, and update existing deterministic rows as well as inserting missing rows. Never add a Temperature group or alter the exclusion slugs.
    - **Verify:** `pnpm test:int -- scripts/seed-supabase.int.test.ts`.

### Phase 5 — [UI] member and guest picker + notes

13. **Expose live variant config to both server pages.**
    - **RED test:** extend `app/(member)/cafe/CafeClient.test.tsx` and `app/(public)/cafe/guest/GuestCafeClient.test.tsx` fixtures/assertions with `AC-701`/`AC-702` config groups and verify the picker can read them.
    - **Files:** `app/(member)/cafe/page.tsx`, `app/(member)/cafe/CafeClient.tsx`, `app/(public)/cafe/guest/page.tsx`, `app/(public)/cafe/guest/GuestCafeClient.tsx`.
    - **Change:** add `variantConfig: VariantConfig | null` to both view types and map `m.variantConfig` from `listMenu`; remove the old hardcoded temperature/sugar assumption from the view contract.
    - **Verify:** `pnpm test:unit -- 'app/(member)/cafe/CafeClient.test.tsx' && pnpm test:unit -- 'app/(public)/cafe/guest/GuestCafeClient.test.tsx'`.

14. **Build one generic accessible picker for both surfaces.**
    - **RED test:** add `components/cafe/VariantPickerModal.test.tsx` for `AC-701`, `AC-702`, and `AC-703`: all configured groups render, required state is announced, first options are selected initially, and a `3000` adjustment changes the displayed unit price.
    - **Files:** `components/cafe/VariantPickerModal.tsx`, `components/cafe/VariantPickerModal.test.tsx`.
    - **Change:** create `VariantPickerModal({ item, onClose, onConfirm })` with `role="dialog"`, labelled group controls, keyboard-visible focus, first-option defaults, per-option adjustment text, selected option state, and `onConfirm(VariantSelectionInput[])`. Calculate display-only preview with the pure pricing helper; never add a client price to the action payload. Use `rounded-xl`, `border-slate-200`, teal selection, and existing typography/button tokens from `DESIGN.md`.
    - **Verify:** `pnpm test:unit -- components/cafe/VariantPickerModal.test.tsx`.

15. **Wire member cart combinations and checkout notes.**
    - **RED test:** extend `CafeClient.test.tsx` with `AC-701`, `AC-703`, and `AC-704`: open the picker, confirm defaults/Cold, assert adjusted text, add Hot and Cold as separate lines, and verify `placeOrder` receives only selections plus trimmed notes.
    - **Files:** `app/(member)/cafe/CafeClient.tsx`, `components/member/cafe/types.ts`, `components/member/cafe/CartPanel.tsx`, `app/(member)/cafe/CafeClient.test.tsx`.
    - **Change:** use `VariantPickerModal`, `addCartLine`, and generic options; adapt each cart line to `OrderLineInput.options`; add a labelled notes `<textarea maxLength={500}>` to `CartPanel`; send `notes` with `placeOrder`; retain pending/error/empty cart states and ensure duplicate selections merge only by the stable cart key.
    - **Verify:** `pnpm test:unit -- 'app/(member)/cafe/CafeClient.test.tsx'`.

16. **Wire guest cart combinations and checkout notes.**
    - **RED test:** extend `GuestCafeClient.test.tsx` with `AC-702`, `AC-703`, and `AC-704`: open the same generic picker, add two selections as distinct lines, and assert checkout sends generic options and trimmed notes.
    - **Files:** `app/(public)/cafe/guest/GuestCafeClient.tsx`, `app/(public)/cafe/guest/GuestCafeClient.test.tsx`.
    - **Change:** remove the private hardcoded `TemperatureOption`/`SugarOption` picker; use `VariantPickerModal` and shared cart helpers; add a labelled 500-character notes control to `CheckoutModal`; pass `notes` to `placeOrder`; retain required guest name, pending, error, success, and responsive cart behavior.
    - **Verify:** `pnpm test:unit -- 'app/(public)/cafe/guest/GuestCafeClient.test.tsx'`.

### Phase 6 — POS DB menu, member lookup, discount, notes, checkout

17. **Add an org-scoped minimal member lookup repository function.**
    - **RED test:** add `AC-715`, `AC-716`, and `AC-717` to `app/(admin)/admin/pos/actions.int.test.ts`; seed same-org MEMBER rows with and without ACTIVE bookings, a non-member, and a cross-org duplicate email candidate, asserting only same-org MEMBER data is returned.
    - **Files:** `lib/db/users.ts`, `app/(admin)/admin/pos/actions.int.test.ts`.
    - **Change:** implement `findMemberByEmail(orgId, email)` with `select({ id, name, email, membershipTier, role })`, `eq(orgId)`, normalized email, `eq(role, "MEMBER")`, `isNull(archivedAt)`, and `limit(1)`. Do not change the global login-only `findByEmail` contract.
    - **Verify:** `pnpm test:int -- 'app/(admin)/admin/pos/actions.int.test.ts'`.

18. **Create ADMIN-only POS lookup and checkout actions.**
    - **RED test:** add `AC-713`, `AC-715`–`AC-718`, and `AC-720` integration cases for notes, no-booking `0%`, active-booking configured percentage, not-found/cross-org privacy, forged user/price/discount rejection, and atomic Cold/order/ledger snapshots.
    - **Files:** `app/(admin)/admin/pos/actions.ts`, `app/(admin)/admin/pos/actions.int.test.ts`.
    - **Change:** implement:
      ```ts
      export async function lookupPosMemberAction(email: string): Promise<PosMemberLookup | null>
      export async function placePosOrder(input: {
        email?: string;
        lines: OrderLineInput[];
        notes?: string;
      }): Promise<CafeOrder>
      ```
      Both call `requireSession()` and throw `FORBIDDEN` unless `role === "ADMIN"`. Normalize email server-side, resolve the same-org member with `findMemberByEmail`, call `resolveDiscountEligibility({ id: member.id, role: "MEMBER", orgId: cashier.orgId })`, read `getActiveBooking`/`getTierDiscounts` only for the resolved member, and call `createOrder` with the server-derived customer id, eligibility, lines, and notes. A blank email creates an unowned POS order; a supplied unknown/non-member email returns not-found and does not disclose data. Extra runtime fields such as `userId`, `subtotalRupiah`, `discountRupiah`, `itemPrice`, and `priceAdjustment` are ignored.
    - **Verify:** `pnpm test:int -- 'app/(admin)/admin/pos/actions.int.test.ts'`.

19. **Pass live variant configs through the POS page.**
    - **RED test:** extend `app/(admin)/admin/pos/PosClient.test.tsx` with `AC-719`, asserting a passed DB item exposes its `variantConfig` to the picker and no source file imports a static cafe menu.
    - **Files:** `app/(admin)/admin/pos/page.tsx`, `app/(admin)/admin/pos/PosClient.tsx`, `app/(admin)/admin/pos/PosClient.test.tsx`.
    - **Change:** add `variantConfig` to `PosMenuItemView` and map it from `listMenu`; preserve the existing hidden/display-name view rules without importing any mock/static menu.
    - **Verify:** `pnpm test:unit -- 'app/(admin)/admin/pos/PosClient.test.tsx'`.

20. **Implement the POS member lookup, variant cart, notes, and checkout UI.**
    - **RED test:** extend `PosClient.test.tsx` with `AC-719` and `AC-720`: lookup displays minimal member/booking/discount state, the variant picker adds a selected line, notes are present, and checkout calls `placePosOrder` with email/options/notes but no client totals or user id.
    - **Files:** `app/(admin)/admin/pos/PosClient.tsx`, `app/(admin)/admin/pos/PosClient.test.tsx`.
    - **Change:** import `lookupPosMemberAction`/`placePosOrder`, use `VariantPickerModal` and `addCartLine`, store options per cart line, add a labelled notes textarea with `maxLength={500}`, show server lookup loading/error/not-found states, and enable checkout only for a non-empty cart. Keep subtotal as display-only preview; submit only `{ email, lines, notes }`; show server-computed result/error after checkout. Use `DESIGN.md` tokens and preserve responsive menu/cart layout.
    - **Verify:** `pnpm test:unit -- 'app/(admin)/admin/pos/PosClient.test.tsx' && pnpm typecheck`.

### Phase 7 — [UI] KDS option snapshots and notes

21. **Map canonical snapshots into the barista read model.**
    - **RED test:** extend `app/barista/BaristaClient.test.tsx` with `AC-714` using a note and generic `{ variantName: "Temperature", optionName: "Cold", priceAdjustmentRupiah: 3000 }` snapshot; assert both option text and note text are present.
    - **Files:** `app/barista/page.tsx`, `app/barista/BaristaClient.tsx`, `app/barista/BaristaClient.test.tsx`.
    - **Change:** replace `formatVariant(temp, sugar)` with `formatVariantOptions(variantOptions)`; add `notes: string | null` to `BaristaOrderView`; map `o.notes` and `item.variantOptions` from the repository. Do not use legacy compatibility columns as the new-write source.
    - **Verify:** `pnpm test:unit -- app/barista/BaristaClient.test.tsx`.

22. **Render the highlighted KDS note treatment without changing lifecycle behavior.**
    - **RED test:** add an `AC-714` assertion that the note block has the warning styling and add `AC-724` to `lib/db/cafe.int.test.ts` for only the existing forward transitions and terminal rejection.
    - **Files:** `app/barista/BaristaClient.tsx`, `app/barista/BaristaClient.test.tsx`, `lib/db/cafe.int.test.ts`.
    - **Change:** render notes in a labelled block using `rounded-xl border border-amber-200 bg-amber-100 text-amber-700`; render each snapshot as `variantName: optionName`; retain optimistic transitions, action role gate, Realtime refresh, manual refresh, empty state, and no backward/terminal transition.
    - **Verify:** `pnpm test:unit -- app/barista/BaristaClient.test.tsx && pnpm test:int -- lib/db/cafe.int.test.ts`.

23. **Retag the Realtime proof for the new acceptance criterion.**
    - **RED test:** rename/extend the existing `useKdsRealtime` test title to `AC-726` and retain assertions for `kds:<orgId>`, `org_id=eq.<orgId>`, refresh on INSERT/UPDATE, and channel cleanup.
    - **Files:** `app/barista/useKdsRealtime.test.tsx`, `app/barista/useKdsRealtime.ts` only if a test exposes a regression.
    - **Change:** keep the existing org-derived channel/filter and cleanup; do not add a client-supplied org id or broaden the subscription.
    - **Verify:** `pnpm test:unit -- app/barista/useKdsRealtime.test.tsx`.

### Phase 8 — traceability and release gate

24. **Complete AC tags and run the cross-layer traceability check.**
    - **Files:** all owning test files named in the table below, plus `docs/plans/2026-08-28-cafe-variants.md` if implementation evidence changes.
    - **Change:** ensure every canonical test title contains its exact `AC-###`; ensure no second test file claims ownership; verify changed code has behavior assertions rather than coverage-only tests. Run `grep -R "AC-7" lib app scripts e2e | sort` and reconcile any missing `AC-700` through `AC-729` before review.
    - **Verify:** `pnpm test:unit && pnpm test:int && pnpm typecheck && pnpm lint:ci && pnpm build`.

## AC traceability — one owning test per criterion

| AC | Owning test file | Layer |
|---|---|---|
| AC-700 | `lib/cafe/variants.test.ts` | Unit |
| AC-701 | `components/cafe/VariantPickerModal.test.tsx` | Unit |
| AC-702 | `components/cafe/VariantPickerModal.test.tsx` | Unit |
| AC-703 | `lib/cafe/pricing.test.ts` | Unit |
| AC-704 | `lib/cafe/cart.test.ts` | Unit |
| AC-705 | `lib/cafe/variants.test.ts` | Unit |
| AC-706 | `lib/cafe/pricing.test.ts` | Unit |
| AC-707 | `lib/db/cafe.int.test.ts` | Integration |
| AC-708 | `lib/db/cafe.int.test.ts` | Integration |
| AC-709 | `lib/cafe/variants.test.ts` | Unit |
| AC-710 | `app/cafe/actions.int.test.ts` | Integration |
| AC-711 | `app/cafe/actions.int.test.ts` | Integration |
| AC-712 | `lib/cafe/validation.test.ts` | Unit |
| AC-713 | `app/(admin)/admin/pos/actions.int.test.ts` | Integration |
| AC-714 | `app/barista/BaristaClient.test.tsx` | Unit |
| AC-715 | `app/(admin)/admin/pos/actions.int.test.ts` | Integration |
| AC-716 | `app/(admin)/admin/pos/actions.int.test.ts` | Integration |
| AC-717 | `app/(admin)/admin/pos/actions.int.test.ts` | Integration |
| AC-718 | `app/(admin)/admin/pos/actions.int.test.ts` | Integration |
| AC-719 | `app/(admin)/admin/pos/PosClient.test.tsx` | Unit |
| AC-720 | `app/(admin)/admin/pos/actions.int.test.ts` | Integration |
| AC-721 | `scripts/seed-supabase.int.test.ts` | Integration |
| AC-722 | `lib/cafe/status.test.ts` | Unit |
| AC-723 | `lib/db/cafe.int.test.ts` | Integration |
| AC-724 | `lib/db/cafe.int.test.ts` | Integration |
| AC-725 | `lib/cafe/validation.test.ts` | Unit |
| AC-726 | `app/barista/useKdsRealtime.test.tsx` | Unit |
| AC-727 | `lib/db/cafe.int.test.ts` | Integration |
| AC-728 | `lib/db/cafe.int.test.ts` | Integration |
| AC-729 | `scripts/seed-supabase.int.test.ts` | Integration |

**Coverage notes:** Existing spec-0003 ACs remain valid; this plan extends their order line and KDS assertions rather than superseding them. The changed pure logic and UI files must retain behavior-focused tests and meet the repository's ≥80% changed-line coverage gate.
