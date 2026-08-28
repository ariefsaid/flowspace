# Plan — Print parity · I-043 · 2026-08-28

Spec: `docs/specs/0009-print-parity.spec.md` (signed off). This branch merges **after I-041/I-040**; migration renumber-check is required at release. This plan claims migrations **0013** and **0014** only. No ADR.

## Design

### Architecture and data flow

The member Server Component resolves the authenticated profile and server-derived `orgId`, then loads the member's bounded print history, active printers, active pricing rows, and tier discount in parallel. The client owns form interaction only: it submits a `FormData` document, page metadata/range, printer id, and print options to a server action. The action re-resolves the session, validates the file and document page count, derives the Storage path from the session org and generated document id, uploads to the private bucket, and calls the typed print repository. The repository re-checks the printer, pricing cell, tier, and balance inside one Drizzle transaction before inserting the job and `PRINT_JOB` ledger row.

The admin report remains an RSC-to-client-leaf surface. Its RSC reads only the session org, bounded rows, and SQL summary; its client leaf renders all five statuses, effective sheets, persisted gross/net money, discount, printer, and completion metadata. Admin mutations are server actions that re-check `ADMIN` in the action body, not only in middleware/layout.

The print agent is the one new HTTP surface: `GET` and `POST /api/print-agent/jobs` use an `x-api-key` only—never a member session. The key has a public selector plus a SHA-256 hash. The route resolves the selector, compares hashes with `crypto.timingSafeEqual` only after equal-length validation, derives the org from the matched config, and then calls an org-scoped repository. Errors are generic. Rate limiting uses a small `print_agent_rate_limit_events` table rather than an in-memory map so the 60-request sliding window is shared by multiple application instances; old events are deleted during the guarded transaction and the config row serializes concurrent calls.

### Schema and migration decisions

- `0013` transforms `org_print_pricing` from one row per org into one row per `(org_id, color_mode, paper_size)`, preserves legacy BW/COLOR A4 values, seeds missing A3/F4 cells, adds print-job lifecycle/range/printer fields, and creates org-scoped `printers`, `print_agent_configs`, and rate-limit event tables. `printer_id` uses `ON DELETE RESTRICT`, so referenced printers cannot be deleted; archiving is the normal removal path.
- `0014` creates org-scoped `print_topup_packages` and seeds exactly 10/Rp10.000, 50/Rp45.000, and 100/Rp80.000 per existing org. `scripts/seed-supabase.ts` uses deterministic ids and upserts the same rows for new/dev orgs.
- `printers` stores `name`, `display_name`, `location`, `printer_type`, `color_support`, `paper_sizes text[]`, active/default/sort/archive flags, and timestamps; `print_agent_configs` stores unique `key_selector`, `key_hash`, active flag, server name, last-seen timestamp, and timestamps; `print_agent_rate_limit_events` stores `org_id`, config id, and request timestamp with `(config_id, requested_at)` indexing. No raw key is persisted.
- Every business table has an `org_id` index, foreign keys, integer/range checks, `GRANT` plus `ENABLE ROW LEVEL SECURITY`, and the `_org_isolation` policy using `current_org()`. The server remains the primary authorization boundary. All repository methods take a server-derived `orgId`; no client payload contains an org, user, tier, balance, price, or authoritative status.
- Money and sheet arithmetic stays integer-only and is bounded before SQL. `total_pages` is effective sheets (`parsed pages × copies`); legacy `pages` remains document page count. Duplex is persisted but never changes effective sheets or pricing.

### Pure logic and repository API

- `lib/print/page-range.ts`: `parsePageRange(range, documentPages): { pageCount: number; normalized: string }`; accepts `all` and strict comma-separated single pages/inclusive ranges, rejects non-positive, reversed, overlapping, duplicate, and out-of-bounds ranges.
- `lib/print/pricing.ts`: `resolvePrintPrice(rows, colorMode, paperSize)` rejects missing/inactive cells with `INVALID_PRINT_PRICING`; `computePrintTotal({ pages, copies, pricePerPageRupiah, discountPct })` returns integer `grossRupiah`, rounded `discountRupiah`, and `totalRupiah`, with int4 overflow checks. There is no Rp500 fallback on submission.
- `lib/db/print-pricing.ts`: `listPrintPricing(orgId)`, `getActivePrintPrice(orgId, colorMode, paperSize)`, and `upsertPrintPricingCell(orgId, cell, txdb?)` use the matrix key. The existing tier-config repository remains the source of the member's server-resolved discount.
- `lib/db/printers.ts`: active member listing, all-admin listing, create/update/archive, and default selection. Default writes clear other non-archived defaults under the org and rely on a partial unique index for the concurrent invariant.
- `lib/db/print.ts`: member history is capped at 20 and includes printer data; `submitPrintJob` validates and atomically debits balance, inserts a snapshot-rich job, and records the ledger; `advancePrintJob` enforces `lib/print/lifecycle.ts`; report summaries sum `total_pages` and COMPLETED `total_rupiah` only.
- `lib/db/print-agent.ts`: selector lookup, key creation/rotation with raw-key-once return, queue pull capped at 50, org-scoped status update, and sliding-window guard. `lib/print-agent/auth.ts` owns parsing and constant-time comparison; route handlers never call `requireSession`.
- `lib/db/print-packages.ts`: active org-scoped package listing and atomic `purchasePrintTopup(orgId, userId, packageId)`, loading the stored package price and writing one completed `PRINT_TOPUP` ledger row in the same transaction.

### UI and performance

Use existing `Card`, `Input`, `Select`, `Button`, `Badge`, `formatRupiah`, and `DESIGN.md` Tailwind tokens. Add no raw color, spacing, or font values. Printer capability controls are derived from the selected server-provided printer; the server repeats those checks. The member page uses bounded parallel reads and the admin report uses one profile lookup plus SQL aggregation, avoiding N+1 queries. Each new client leaf includes loading/error/empty/disabled states, responsive overflow handling, labels, focus styles, and keyboard-operable controls. No caching is added to money or queue reads; short-lived signed URLs are generated only for authenticated agent responses and are org-prefix checked.

## Tasks

### 1. Pricing-matrix migration, repository, and backfill

1. **Write the migration/backfill red test first** — `lib/db/print-migration.int.test.ts`: seed a legacy-shaped pricing row and a historic job, apply the migration through the normal test reset, then assert `AC-634`: BW/COLOR A4 values survive, A3/F4 cells exist with `1000/600/4000/2500`, historic rows have `page_range = 'all'` and `total_pages = pages * copies`, and no job was removed. Also assert `AC-632` against the new pricing, printer, agent-config, and package tables through the existing scoped-RLS helper. Verify command (red before implementation, green after migration): `pnpm exec supabase db reset && pnpm test:int -- 'lib/db/print-migration.int.test.ts'`.

2. **Add the core schema migration** — `supabase/migrations/0013_print_parity_core.sql`: create `printers`, `print_agent_configs`, and `print_agent_rate_limit_events`; add `PROCESSING` and `FAILED` to `PrintJobStatus`; rename the old pricing table to `org_print_pricing_legacy`, create the matrix `org_print_pricing` with `color_mode`, `paper_size`, `price_per_page_rupiah`, `is_active`, and the unique `(org_id, color_mode, paper_size)` key, then backfill using explicit `UNION ALL` rows for legacy BW/A4 and COLOR/A4 plus missing defaults BW/A3=1000, BW/F4=600, COLOR/A3=4000, COLOR/F4=2500. Add `page_range`, `total_pages`, nullable `printer_id REFERENCES printers(id) ON DELETE RESTRICT`, `error_message`, `processed_by`, `processed_at`, and `completed_at` to `print_jobs`, then run `UPDATE print_jobs SET page_range = 'all', total_pages = pages * copies`. Add `CHECK` clauses for positive quantities and int4-safe money/sheet values, lookup indexes, grants, and concrete policies such as `CREATE POLICY printers_org_isolation ON printers FOR ALL TO authenticated USING (org_id = current_org()) WITH CHECK (org_id = current_org())` for each new org table. Verify command: `pnpm exec supabase db reset`.

3. **Mirror the migration in Drizzle and update enum constants** — `lib/db/schema.ts` and `lib/db/enums.ts`: replace the flat `orgPrintPricing` columns with `colorMode`, `paperSize`, `pricePerPageRupiah`, and `isActive`; add the new printer, print-agent config, rate-event, and job fields; add `printTopupPackages` in the later schema block; set `printJobStatusEnum`/`PRINT_JOB_STATUSES` to `PENDING`, `PROCESSING`, `READY`, `COMPLETED`, `FAILED`; export `Printer`, `PrintAgentConfig`, `PrintTopupPackage`, and the updated `PrintJob` types. Add schema-column assertions in `lib/db/schema.test.ts`, including `totalPages`, `pageRange`, `printerId`, and all five statuses. Verify command: `pnpm test:unit -- 'lib/db/schema.test.ts' && pnpm typecheck`.

4. **Seed the six matrix cells** — `lib/print/pricing.ts`, `scripts/seed-supabase.ts`: define the exact matrix `BW/A4=500`, `BW/A3=1000`, `BW/F4=600`, `COLOR/A4=2000`, `COLOR/A3=4000`, `COLOR/F4=2500`; make the seed upsert deterministic `<orgId>__print-<mode>-<paper>` rows. Tier discount defaults (`DEFAULT_PRINT_DISCOUNT_PCT` → 0/5/10) are **owned by I-041** (migration 0010 + its seed change) — this branch merges after I-041 and reuses them; do not edit tier defaults here. Keep all six values integer Rupiah. Update the seed assertions in `lib/db/pricing-config.int.test.ts` so the matrix and tier fixtures match the signed values. Verify command: `pnpm exec supabase db reset && pnpm db:seed:supabase && pnpm test:int -- 'lib/db/pricing-config.int.test.ts'`.

5. **Replace flat pricing repository methods** — `lib/db/print-pricing.ts`: introduce
   `listPrintPricing(orgId): Promise<OrgPrintPricing[]>`,
   `getActivePrintPrice(orgId, colorMode, paperSize): Promise<number | null>`, and
   `upsertPrintPricingCell(orgId, { colorMode, paperSize, pricePerPageRupiah, isActive }, txdb?)`; validate `paperSize` against `A4 | A3 | F4`, positive integer price, and int4 bounds before the upsert. Remove the flat fallback from `getPrintPricing`; return `null` for missing/inactive cells so the caller can reject. Write the failing org-isolation/upsert test tagged `AC-623` in `lib/db/pricing-config.int.test.ts` before the implementation. Verify command: `pnpm test:int -- 'lib/db/pricing-config.int.test.ts'`.

### 2. Page-range parser and pricing pure functions

6. **Implement parser tests before the parser** — `lib/print/page-range.test.ts` and `lib/print/page-range.ts`: first add tests titled `AC-603`, `AC-604`, `AC-605`, and `AC-606`; then implement `parsePageRange` so `all` on 12 pages returns `{ pageCount: 12 }`, `1-5,8,10-12` returns `{ pageCount: 9 }`, and a `Set` of every expanded page rejects duplicates/overlaps, reversed ranges, zero, malformed tokens, non-integer document pages, and non-positive copies. Verify command: `pnpm test:unit -- 'lib/print/page-range.test.ts'`.

7. **Make arithmetic matrix-based and overflow-safe** — `lib/print/pricing.test.ts` and `lib/print/pricing.ts`: add the failing `AC-600` six-cell resolver test, `AC-602` test for `3 COLOR A3 × 2` at 5% (`grossRupiah: 24000`, `discountRupiah: 1200`, `totalRupiah: 22800`), and `AC-636` duplex-invariance test. Implement `resolvePrintPrice` without a fallback and `computePrintTotal({ pages, copies, pricePerPageRupiah, discountPct })` with `Math.round(gross * discountPct / 100)`, `Number.isSafeInteger`/int4 checks, and `totalRupiah = grossRupiah - discountRupiah`. Verify command: `pnpm test:unit -- 'lib/print/pricing.test.ts'`.

8. **Add document-page extraction and strict request validation** — `package.json`, `lib/print/document-pages.ts`, `lib/print/validation.ts`, and `lib/print/validation.test.ts`: add `pdf-lib` as a runtime dependency, implement `getPdfPageCount(bytes)` with `PDFDocument.load(bytes).getPageCount()`, derive PDF pages from bytes rather than client metadata, and require a positive integer `documentPages` only for accepted non-PDF files. Add strict decimal parsing (not `parseInt` prefix acceptance) and a test titled `AC-606` for non-positive pages/copies, plus ordinary validation coverage for spoofed MIME, >10 MB, traversal names, and the existing private `<orgId>/print/<documentId>/<safeFileName>` path contract. Preserve `validatePrintFile` and `validatePrintMagicBytes` as the pre-Storage gates. Verify command: `pnpm test:unit -- 'lib/print/validation.test.ts' 'lib/storage/uploads.test.ts'`.

### 3. Printers CRUD repository and admin UI

9. **Write printer repository integration tests first** — `lib/db/printers.int.test.ts` and `lib/db/printers.ts`: add failing tests titled `AC-609` and `AC-633` covering create/edit/archive fields, org-scoped unique names, active/default selection, and concurrent default writes leaving at most one non-archived default. Implement `listActivePrinters(orgId)`, `listPrintersForAdmin(orgId)`, `createPrinter`, `updatePrinter`, `archivePrinter`, and `setDefaultPrinter` with org predicates, transaction locking, and partial unique-default enforcement. Verify command: `pnpm test:int -- 'lib/db/printers.int.test.ts'`.

10. **Add admin printer actions with in-action role checks** — `app/(admin)/admin/settings/printers/actions.ts` and `app/(admin)/admin/settings/printers/actions.test.ts`: add failing tests for a MEMBER and BARISTA receiving `FORBIDDEN` with zero repository calls, then implement `requireSession()` followed by `if (user.role !== "ADMIN") throw new Error("FORBIDDEN")`; pass only `user.orgId` to the repository and call `revalidatePath` after create/update/archive/default mutations. Verify command: `pnpm test:unit -- 'app/(admin)/admin/settings/printers/actions.test.ts'`.

11. **Build the printer CRUD page and route link** `[UI]` — `app/(admin)/admin/settings/printers/page.tsx`, `PrintersClient.tsx`, `app/(admin)/admin/settings/page.tsx`, and `PrintersClient.test.tsx`: add a failing printer-form UI regression test, then render accessible labelled inputs for CUPS name, display name, location, type, color support, paper-size checkboxes, active/default flags, sort order, create/edit/archive controls, loading/saving/error states, and an empty state. Use existing `Card`, `Input`, `Select`, `Button`, and `DESIGN.md` tokens; link the existing “Daftar Printer” settings card to `/admin/settings/printers`. Verify command: `pnpm test:unit -- 'app/(admin)/admin/settings/printers/PrintersClient.test.tsx' && pnpm typecheck && pnpm lint:ci`.

### 4. Member `/print` form and capability/balance gating

12. **Extend member print reads and server submit contract** — `lib/db/print.ts`, `app/(member)/print/page.tsx`, and `app/(member)/print/actions.ts`: add the failing integration tests titled `AC-601`, `AC-607`, `AC-608`, `AC-610`, `AC-611`, and `AC-635` in `lib/db/print.int.test.ts`, then make `submitPrintJob` accept `{ pageRange, documentPages, printerId?, copies, colorMode, paperSize, duplex, storagePath }`. Resolve the member/tier from `(userId, orgId)`, parse the range before DB writes, require an active org printer/default, reject unsupported color/paper and inactive pricing, calculate gross/rounded discount/net from the selected matrix cell, atomically debit `printBalance >= totalPages`, insert the printer/range/page/copy snapshots, and write one `PRINT_JOB` ledger row. `listPrintJobsByUser` must be `.limit(20)` and join/select printer display data without exposing other users or orgs. Verify command: `pnpm test:int -- 'lib/db/print.int.test.ts'`.

13. **Preserve upload hardening while deriving document pages** — `app/(member)/print/actions.ts` and `app/(member)/print/actions.int.test.ts`: add failing tests titled `AC-606` and `AC-631`; parse FormData fields strictly, use `getPdfPageCount` for PDF bytes and validated metadata for other accepted formats, call `validatePrintFile` and `validatePrintMagicBytes` before `uploadPrintDocument`, build the path from `user.orgId` and a generated document id, and pass `pageRange`, `documentPages`, and `printerId` to `submitPrintJob`. A missing session must fail before Storage or repository calls. Verify command: `pnpm test:int -- 'app/(member)/print/actions.int.test.ts' && pnpm test:unit -- 'lib/print/validation.test.ts'`.

14. **Wire capability-aware member form and history states** `[UI]` — `app/(member)/print/PrintClient.tsx`, `components/member/print/PrintSummary.tsx`, `components/member/print/PrintHistory.tsx`, `app/(member)/print/PrintClient.test.tsx`, and `app/(member)/print/page.tsx`: add a failing capability-gating test titled `AC-627`, then pass active printers, six pricing rows, and server tier discount into the client. Render file name/size, document pages, range, copies, color, paper, printer, duplex, exact preview totals, insufficient balance, missing/inactive pricing, disabled unsupported COLOR/paper options, submit/loading/error states, and all five mapped statuses. Use `printer.colorSupport` and `printer.paperSizes` only for UX; retain server rejection. Verify command: `pnpm test:unit -- 'app/(member)/print/PrintClient.test.tsx' && pnpm typecheck && pnpm lint:ci`.

### 5. Lifecycle statuses and admin report

15. **Specify the state machine as a pure function first** — `lib/print/lifecycle.ts` and `lib/print/lifecycle.test.ts`: add failing `AC-615` tests and implement `canTransition`/`transitionPrintJob` for `PENDING → PROCESSING`, `PROCESSING → READY|FAILED`, `READY → COMPLETED`, and resolved `FAILED → PROCESSING|COMPLETED`; reject regressions and require explicit resolution metadata for a failed job. Verify command: `pnpm test:unit -- 'lib/print/lifecycle.test.ts'`.

16. **Implement lifecycle repository writes and report summary** — `lib/db/print.ts` and `lib/db/print.int.test.ts`: add failing tests titled `AC-616`, `AC-623`, and `AC-637`; implement `advancePrintJob(orgId, jobId, nextStatus, { processedBy?, errorMessage? })` inside a transaction with an org-scoped row lock, timestamps/fields set exactly by transition, and no write on illegal transitions. Update `getPrintReportSummary` to sum `print_jobs.total_pages` and COMPLETED `total_rupiah` only. Verify command: `pnpm test:int -- 'lib/db/print.int.test.ts'`.

17. **Update report mapping and status tests** `[UI]` — `app/(admin)/admin/print-reports/derive.ts`, `PrintReportsClient.tsx`, `derive.test.ts`, `PrintReportsClient.test.tsx`, and `page.tsx`: add failing tests titled `AC-614`, `AC-625`, and `AC-626`, then include effective pages, copies, printer, gross/net/discount, status tone/label, processed/completed metadata, and action availability in the view. Map `PENDING`/`PROCESSING`/`READY`/`COMPLETED`/`FAILED` to DESIGN-approved badge tones, keep gross struck through when discounted, render the no-jobs empty state without a table, and preserve bounded rows plus SQL summary. Verify command: `pnpm test:unit -- 'app/(admin)/admin/print-reports/derive.test.ts' 'app/(admin)/admin/print-reports/PrintReportsClient.test.tsx'`.

18. **Add admin report status action and controls** `[UI]` — `app/(admin)/admin/print-reports/actions.ts`, `PrintReportsClient.tsx`, and `app/(admin)/admin/print-reports/actions.test.ts`: add a failing test for ADMIN-only status changes and pending/processing/ready action progression (the repository integration test remains the owner of `AC-616`); implement the action with `requireSession`, an explicit ADMIN check, `user.orgId`, `advancePrintJob`, and `revalidatePath`. Buttons must be labelled, keyboard accessible, disabled while pending, and show generic error feedback. Verify command: `pnpm test:unit -- 'app/(admin)/admin/print-reports/actions.test.ts' 'app/(admin)/admin/print-reports/PrintReportsClient.test.tsx'`.

### 6. Agent pull API route handlers and key configuration

19. **Add key configuration repository and admin action tests first** — `lib/db/print-agent.ts`, `lib/print-agent/auth.ts`, `app/(admin)/admin/settings/print-server/actions.ts`, `app/(admin)/admin/settings/print-server/actions.test.ts`, and `app/(admin)/admin/settings/print-authorization.int.test.ts`: write the failing `AC-624` authorization-boundary test covering pricing, printer, key, and status actions before implementation. Add ordinary unit coverage for key generation and parsing. Generate a raw key with `randomBytes`, return it only from the creation result, store only `keySelector` and a SHA-256 `keyHash`, reject malformed/duplicate configurations, and require ADMIN in the server action. Implement `authenticatePrintAgent` so malformed headers stop before a config/job query and `timingSafeEqual` runs only on equal-length buffers. Verify command: `pnpm test:unit -- 'app/(admin)/admin/settings/print-server/actions.test.ts' 'lib/print-agent/auth.test.ts' && pnpm test:int -- 'app/(admin)/admin/settings/print-authorization.int.test.ts'`.

20. **Build the key configuration UI** `[UI]` — `app/(admin)/admin/settings/print-server/page.tsx`, `PrintServerClient.tsx`, `PrintServerClient.test.tsx`, and `app/(admin)/admin/settings/page.tsx`: add a failing one-time-key UI regression test, then render current selector/server/active state, generate/rotate controls, a one-time raw-key alert with copy affordance, never render the stored hash, and loading/error/empty states. Link “Print Server (Mini PC)” to `/admin/settings/print-server`; use only existing DESIGN tokens and accessible form semantics. Verify command: `pnpm test:unit -- 'app/(admin)/admin/settings/print-server/PrintServerClient.test.tsx' && pnpm typecheck && pnpm lint:ci`.

21. **Add shared rate-limit guard tests and implementation** — `lib/db/print-agent-rate-limit.ts` and `lib/db/print-agent-rate-limit.int.test.ts`: add failing sliding-window tests for 60 allowed calls, the 61st rejected within 60 seconds, old-event cleanup, and no key/job disclosure (the route contract remains the owner of `AC-622`). Implement a transaction that locks the matched config row, deletes `requested_at < now() - interval '60 seconds'`, counts the selector's remaining events, inserts only when below 60, and uses `Retry-After` data without logging the secret. Verify command: `pnpm test:int -- 'lib/db/print-agent-rate-limit.int.test.ts'`.

22. **Implement GET agent queue route** — `app/api/print-agent/jobs/route.ts` and `app/api/print-agent/jobs/route.int.test.ts`: first add failing tests titled `AC-617`, `AC-618`, `AC-619`, and `AC-622`; then implement `GET` with `authenticatePrintAgent(request)`, a numeric limit default 10 capped at 50, an ascending `PENDING`/`PROCESSING` org-scoped queue, and short-lived signed URLs only after `getSignedDownloadUrl(config.orgId, job.storagePath)` passes the org-prefix guard. Return generic 401/429/400/500 responses and no session lookup. Verify command: `pnpm test:int -- 'app/api/print-agent/jobs/route.int.test.ts'`.

23. **Implement POST agent status route** — `app/api/print-agent/jobs/route.ts` and `app/api/print-agent/jobs/route.int.test.ts`: add failing `AC-620` and `AC-621` tests for each allowed status, unknown status, completed regression, and failed retry. Parse only `{ jobId, status, processedBy?, errorMessage? }`, authenticate first, pass the resolved org to `advancePrintJob`, and return generic JSON without exposing config/hash/job rows. Verify command: `pnpm test:int -- 'app/api/print-agent/jobs/route.int.test.ts'`.

24. **Extend RLS and route policy coverage** — `lib/db/rls.int.test.ts`, `lib/auth/route-policy.test.ts`, and the migration if required: add the failing `AC-632` test for printers, matrix rows, jobs, agent configs, packages, and rate events under two `current_org()` claims, and add route-handler tests proving `/api/print-agent/jobs` is not accidentally made a member page. Keep agent authentication key-only while admin/member browser pages retain existing middleware/layout gates. Verify command: `pnpm exec supabase db reset && pnpm test:int -- 'lib/db/rls.int.test.ts' && pnpm test:unit -- 'lib/auth/route-policy.test.ts'`.

### 7. Print top-up packages

25. **Create package migration and seed test** — `supabase/migrations/0014_print_topup_packages.sql`, `lib/db/print-packages.int.test.ts`, and `lib/db/schema.ts`: add the failing `AC-628`/`AC-630` integration test, then create `print_topup_packages` with org-scoped id, `pages`, `price_rupiah`, active/sort/archive/timestamp fields, int4 checks, org index, RLS policy, and deterministic migration seed rows `(10,10000)`, `(50,45000)`, `(100,80000)` in sort order. Add `listPrintTopupPackages(orgId)` and assert archived/unknown/cross-org ids are absent. Verify command: `pnpm exec supabase db reset && pnpm test:int -- 'lib/db/print-packages.int.test.ts'`.

26. **Implement atomic package purchase** — `lib/db/print-packages.ts`, `app/(member)/topup/actions.ts`, and `lib/db/print-packages.int.test.ts`: add the failing `AC-629` and `AC-630` tests, then implement `purchasePrintTopup({ orgId, userId, packageId })` to load an active package scoped to org, atomically increment `app_users.print_balance` and insert exactly one completed `PRINT_TOPUP` ledger row with the stored `price_rupiah`, and reject before writes for unknown/archived/cross-org packages or no member session. Change `topUpPrintAction` to accept only `packageId`; leave time-credit package purchase unchanged. Verify command: `pnpm test:int -- 'lib/db/print-packages.int.test.ts' && pnpm test:unit -- 'app/(member)/topup/actions.test.ts'`.

27. **Wire seeded package data into `/topup`** `[UI]` — `scripts/seed-supabase.ts`, `app/(member)/topup/page.tsx`, `app/(member)/topup/TopupClient.tsx`, `app/(member)/topup/TopupClient.test.tsx`, and `app/(member)/topup/actions.ts`: add a failing server-package rendering regression test, seed/upsert the three package ids and prices, pass `PrintTopupPackageView[]` from the RSC, replace the UI-only flat-rate array with server rows, send the selected `packageId`, and preserve click-through pending, refresh, error, empty, responsive, focus, and accessible states. Verify command: `pnpm exec supabase db reset && pnpm db:seed:supabase && pnpm test:unit -- 'app/(member)/topup/TopupClient.test.tsx' && pnpm test:int -- 'lib/db/print-packages.int.test.ts'`.

28. **Add the curated end-to-end journey** `[UI]` — `e2e/AC-639-print-parity.spec.ts`: write the failing `AC-639` Playwright journey before final UI wiring: log in the seeded member, open `/print`, upload a valid tiny PDF, choose an active supported printer, submit, revisit/refresh `/print`, and assert the job filename, server-computed effective pages/price, `PENDING` status, and balance delta. Do not use client-supplied price, tier, balance, or org assertions as the oracle. Verify command: `pnpm e2e -- e2e/AC-639-print-parity.spec.ts`.

29. **Run complete gates and migration renumber check** — update all affected existing tests (`lib/db/print.int.test.ts`, `lib/db/pricing-config.int.test.ts`, `lib/print/pricing.test.ts`, `app/(member)/print/PrintClient.test.tsx`, `app/(member)/topup/TopupClient.test.tsx`, and report tests) so old flat-rate assumptions no longer contradict the signed spec, then run `pnpm exec supabase db reset`, `pnpm db:seed:supabase`, `pnpm typecheck`, `pnpm lint:ci`, `pnpm test:unit`, `pnpm test:int`, `pnpm build`, and the curated e2e file. Before release, verify that I-041/I-040 migration files have landed and rename only this branch's `0013`/`0014` if the ordered stream requires it; rerun the reset after renumbering. Verify command: `pnpm exec supabase db reset && pnpm typecheck && pnpm lint:ci && pnpm test:unit && pnpm test:int && pnpm build && pnpm e2e -- e2e/AC-639-print-parity.spec.ts`.

## Traceability

| AC | Owning test | Layer |
|---|---|---|
| AC-600 | `lib/print/pricing.test.ts` — `AC-600` | Unit |
| AC-601 | `lib/db/print.int.test.ts` — `AC-601` | Integration |
| AC-602 | `lib/print/pricing.test.ts` — `AC-602` | Unit |
| AC-603 | `lib/print/page-range.test.ts` — `AC-603` | Unit |
| AC-604 | `lib/print/page-range.test.ts` — `AC-604` | Unit |
| AC-605 | `lib/print/page-range.test.ts` — `AC-605` | Unit |
| AC-606 | `lib/print/page-range.test.ts` — `AC-606` | Unit |
| AC-607 | `lib/db/print.int.test.ts` — `AC-607` | Integration |
| AC-608 | `lib/db/print.int.test.ts` — `AC-608` | Integration |
| AC-609 | `lib/db/printers.int.test.ts` — `AC-609` | Integration |
| AC-610 | `lib/db/print.int.test.ts` — `AC-610` | Integration |
| AC-611 | `lib/db/print.int.test.ts` — `AC-611` | Integration |
| AC-612 | `lib/storage/uploads.test.ts` — `AC-612` | Unit |
| AC-613 | `lib/db/print.int.test.ts` — `AC-613` | Integration |
| AC-614 | `app/(admin)/admin/print-reports/derive.test.ts` — `AC-614` | Unit |
| AC-615 | `lib/print/lifecycle.test.ts` — `AC-615` | Unit |
| AC-616 | `lib/db/print.int.test.ts` — `AC-616` | Integration |
| AC-617 | `app/api/print-agent/jobs/route.int.test.ts` — `AC-617` | Integration |
| AC-618 | `app/api/print-agent/jobs/route.int.test.ts` — `AC-618` | Integration |
| AC-619 | `app/api/print-agent/jobs/route.int.test.ts` — `AC-619` | Integration |
| AC-620 | `app/api/print-agent/jobs/route.int.test.ts` — `AC-620` | Integration |
| AC-621 | `app/api/print-agent/jobs/route.int.test.ts` — `AC-621` | Integration |
| AC-622 | `app/api/print-agent/jobs/route.int.test.ts` — `AC-622` | Integration |
| AC-623 | `lib/db/pricing-config.int.test.ts` — `AC-623` | Integration |
| AC-624 | `app/(admin)/admin/settings/print-authorization.int.test.ts` — `AC-624` | Integration boundary |
| AC-625 | `app/(admin)/admin/print-reports/derive.test.ts` — `AC-625` | Unit |
| AC-626 | `app/(admin)/admin/print-reports/PrintReportsClient.test.tsx` — `AC-626` | Unit |
| AC-627 | `app/(member)/print/PrintClient.test.tsx` — `AC-627` | Unit |
| AC-628 | `lib/db/print-packages.int.test.ts` — `AC-628` | Integration |
| AC-629 | `lib/db/print-packages.int.test.ts` — `AC-629` | Integration |
| AC-630 | `lib/db/print-packages.int.test.ts` — `AC-630` | Integration |
| AC-631 | `app/(member)/print/actions.int.test.ts` — `AC-631` | Integration boundary |
| AC-632 | `lib/db/rls.int.test.ts` — `AC-632` | Integration |
| AC-633 | `lib/db/printers.int.test.ts` — `AC-633` | Integration |
| AC-634 | `lib/db/print-migration.int.test.ts` — `AC-634` | Integration |
| AC-635 | `lib/db/print.int.test.ts` — `AC-635` | Integration |
| AC-636 | `lib/print/pricing.test.ts` — `AC-636` | Unit |
| AC-637 | `lib/db/print.int.test.ts` — `AC-637` | Integration |
| AC-638 | `app/api/print-agent/jobs/route.int.test.ts` — `AC-638` | Integration |
| AC-639 | `e2e/AC-639-print-parity.spec.ts` — `AC-639` | E2E |

Task count: 29. Riskiest task: 22–23 (key-only, constant-time, org-resolved agent route plus signed-URL and rate-limit behavior). Migration claimed: 0013 and 0014, subject to the post-I-041/I-040 renumber check. ADR: none. Open questions: none for the signed spec.
