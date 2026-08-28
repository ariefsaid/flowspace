# Spec 0009 — Print parity

- **Status:** Draft (I-043)
- **Source / scope:** ORIG `app/api/print/jobs`, `app/api/print-server/jobs`, `app/api/admin/printers`, `app/api/admin/settings/print`, `app/print`, and `app/api/papercut` routes plus the listed ORIG schema/types/seed; current FlowSpace print repositories, storage seam, member top-up/print pages, and admin print report. Gap analysis §2.4 is authoritative.
- **Depends on:** spec 0002 (auth/session/tenancy), spec 0005 (admin print report), spec 0006 (tier pricing), ADR-0010, ADR-0013–0015.
- **Purpose:** replace the flat per-org print rate and page top-up with ORIG's priced matrix, printer-bound jobs, validated page ranges, complete job lifecycle, package top-ups, and a tenant-safe print-agent pull API while retaining FlowSpace's stronger upload and money-path controls.

## Scope

**In:** org-scoped pricing matrix and admin editing; printer CRUD; member `/print` wiring; server page-range parsing and pricing; `PROCESSING`/`FAILED` lifecycle and admin status updates; hashed, org-scoped agent key configuration plus `GET`/`POST /api/print-agent/jobs`; seeded print top-up packages and `/topup` wiring; report fields/statuses and all required loading, empty, error, and validation states.

**Out:** the physical agent script/CUPS implementation; printer UI polish beyond CRUD; CSV/PDF export; payment-provider settlement; top-up package admin CRUD (seeded and repository-ready for a later issue).

## Observations (ORIG, EARS)

- **OBS-600** (event-driven) — When an authenticated member opens `/print`, ORIG loads that member's recent jobs, available printers, pricing rows, print balance, and tier discount.
- **OBS-601** (event-driven) — When a member chooses a document, ORIG's print form accepts PDF, Office documents, and common image formats and displays the file name and size.
- **OBS-602** (ubiquitous) — The print form shall expose document page count, page range, copies, color mode, paper size, duplex, and printer controls.
- **OBS-603** (event-driven) — When `pageRange` is `all`, ORIG uses the submitted document page count; when it is a comma-separated list, ORIG counts single pages and inclusive ranges.
- **OBS-604** (event-driven) — When copies is greater than one, ORIG multiplies the selected-page count by copies for `totalPages` and balance validation.
- **OBS-605** (ubiquitous) — ORIG's `PrintPricing` lookup prices `BW×A4` at Rp500, `BW×A3` at Rp1.000, `BW×F4` at Rp600, `COLOR×A4` at Rp2.000, `COLOR×A3` at Rp4.000, and `COLOR×F4` at Rp2.500 per sheet.
- **OBS-606** (event-driven) — When a member submits a job, ORIG loads the member's tier and applies its print discount percentage to the gross charge.
- **OBS-607** (conditional) — When an ORIG pricing combination is absent, its helper silently uses Rp500 per sheet.
- **OBS-608** (event-driven) — When the member balance is below `totalPages`, ORIG rejects submission and reports the required and available sheets.
- **OBS-609** (event-driven) — When no printer is supplied, ORIG selects an active default printer; an explicitly supplied printer is stored on the job.
- **OBS-610** (state-driven) — While a selected printer has no color support, ORIG does not offer COLOR; while it supports color, both BW and COLOR are offered.
- **OBS-611** (state-driven) — While a printer is selected, ORIG offers its configured paper sizes and stores the selected size.
- **OBS-612** (event-driven) — When duplex is toggled, ORIG stores the boolean and passes it through the job options.
- **OBS-613** (event-driven) — When a valid print request is submitted, ORIG creates a `PENDING` job containing range, copies, mode, paper, effective pages, costs, and printer.
- **OBS-614** (event-driven) — When a job is created, ORIG decrements the PaperCut balance and writes a `PRINT_JOB` transaction for the net cost.
- **OBS-615** (event-driven) — When `/api/print/jobs` is read, ORIG returns the member's 20 newest jobs and includes printer information.
- **OBS-616** (state-driven) — While a job is displayed, ORIG labels `PENDING`, `PROCESSING`, `READY`, `COMPLETED`, and `FAILED` as waiting, processing, ready to collect, completed, and failed.
- **OBS-617** (event-driven) — When the print agent calls its jobs endpoint, ORIG authenticates the `x-api-key` header.
- **OBS-618** (ubiquitous) — ORIG stores the agent key in a site setting and compares the supplied value directly.
- **OBS-619** (event-driven) — When an authenticated agent requests jobs, ORIG returns an ascending queue filtered to `PENDING` or `PROCESSING`, with a caller limit defaulting to 10.
- **OBS-620** (event-driven) — When a queued job has a file URL, ORIG adds a signed download URL to the agent response.
- **OBS-621** (event-driven) — When the agent posts a status, ORIG accepts `PROCESSING`, `READY`, `COMPLETED`, or `FAILED` and rejects other values.
- **OBS-622** (event-driven) — When the agent posts processing or completion, ORIG records processing/completion timestamps and optional `processedBy`; when it posts failure, ORIG records `errorMessage`.
- **OBS-623** (event-driven) — When an admin operates the report action, ORIG advances a pending job to processing, a processing job to ready, and a ready job to completed.
- **OBS-624** (event-driven) — When printers are listed, ORIG returns active printers to members and all printers to admins.
- **OBS-625** (event-driven) — When an admin creates or edits a printer, ORIG persists CUPS name, display name, location, type, color support, paper sizes, active/default flags, and sort order.
- **OBS-626** (state-driven) — While a printer is marked default, ORIG unmarks other defaults; a printer name is globally unique and deletion is blocked when jobs reference it.
- **OBS-627** (event-driven) — When an admin edits print settings, ORIG upserts or deletes a unique color-mode/paper-size price row and can toggle it active.
- **OBS-628** (event-driven) — When a member selects a PaperCut package, ORIG offers 10 pages/Rp10.000, 50 pages/Rp45.000, or 100 pages/Rp80.000.
- **OBS-629** (event-driven) — When a PaperCut package is purchased, ORIG increments the member balance and writes a completed top-up transaction.

## Functional requirements (EARS)

- **FR-630** (ubiquitous) — Every print table, repository method, server action, and route shall use the server-resolved `orgId`; clients shall never submit an `orgId`, user id, tier, balance, price, or status authority.
- **FR-631** (conditional) — When a requested `(colorMode, paperSize)` row is missing or inactive, the server shall reject the submission with a validation error and shall not use ORIG's Rp500 fallback or write a job, debit, or ledger row.
- **FR-632** (event-driven) — When a job is submitted, the server shall derive PDF page count from the uploaded bytes; for accepted non-PDF formats it shall accept only a validated positive page-count metadata value, parse `all` or `1-5,8,10-12`, validate every endpoint against that count, and compute effective pages as parsed count × copies; invalid syntax, reversed/overlapping/duplicate/out-of-bounds ranges shall be rejected.
- **FR-633** (event-driven) — When a job is submitted, the server shall bind an active printer in the caller's org (or the caller-org active default), require COLOR only when `colorSupport=true`, and require paper size membership in that printer's `paperSizes`.
- **FR-634** (event-driven) — When a valid job is submitted, the server shall compute gross, rounded integer discount, and net cost from the matrix and tier config, then conditionally debit `printBalance >= effectivePages` and insert the job plus `PRINT_JOB` ledger row in one transaction.
- **FR-635** (state-driven) — While a job is being advanced by an authorized admin or authenticated agent, its state shall obey `PENDING → PROCESSING → READY → COMPLETED` or `PROCESSING → FAILED → PROCESSING/COMPLETED`; failed-job retry/resolution is explicit, and `processed_at`/`processed_by`, `error_message`, and `completed_at` shall be recorded or cleared according to the transition.
- **FR-636** (event-driven) — When an agent request arrives, the server shall resolve its org from a key selector and constant-time hash comparison; an unset, malformed, inactive, or mismatched key shall fail closed with 401 and reveal no job data.
- **FR-637** (event-driven) — When a member buys a seeded print package, the server shall load the active package by org-scoped id, use its stored price, and atomically credit its pages with a completed `PRINT_TOPUP` ledger row.
- **FR-638** (ubiquitous) — Every accepted upload shall retain the existing allowlist, magic-byte validation, 10 MB cap, and `<orgId>/print/<documentId>/<safeFileName>` private Storage path; agent downloads shall use short-lived org-checked signed URLs.
- **FR-639** (event-driven) — When an admin opens the print report or changes print configuration, the server shall return org-scoped rows and integer persisted money fields, and the UI shall expose complete loading, empty, error, responsive, and accessible states without changing DESIGN.md tokens.

## Non-functional requirements

- **NFR-600** (ubiquitous) — Monetary and quantity fields shall be integer Rupiah/sheets; `discountRupiah = Math.round(grossRupiah × discountPct / 100)` and `totalRupiah = grossRupiah − discountRupiah`; arithmetic shall reject values above PostgreSQL `int4` range.
- **NFR-601** (ubiquitous) — Agent GET and POST shall be rate-limited to 60 requests per key per minute, cap queue `limit` at 50, and return generic errors; key secrets shall never be logged or returned after creation.
- **NFR-602** (ubiquitous) — New tables and routes shall have org indexes, RLS `org_id` backstop policies, server-side role checks, and bounded reads; admin is required for pricing/printer/key/status configuration, member for own print and top-up, and agent only for its resolved org queue.

## Acceptance criteria (one owning layer per ADR-0010)

- **AC-600** — Given the six seeded rows, when the pricing helper resolves each combination, then it returns exactly the six rates in OBS-605. *(unit)*
- **AC-601** — Given a missing or inactive combination, when submission runs, then it returns a validation error and leaves balance, job, and ledger unchanged. *(integration)*
- **AC-602** — Given 3 COLOR A3 pages, 2 copies, and a 5% tier discount, when totals run, then gross is Rp24.000, discount Rp1.200, and net Rp22.800. *(unit)*
- **AC-603** — Given a 12-page document and `all`, when parsing runs, then parsed pages are 12 and two copies require 24 sheets. *(unit)*
- **AC-604** — Given `1-5,8,10-12`, when parsing runs, then parsed pages are 9 and two copies require 18 sheets. *(unit)*
- **AC-605** — Given reversed, overlapping, duplicate, zero, or out-of-bounds ranges, when parsing runs, then it rejects with a validation error and performs no write. *(unit)*
- **AC-606** — Given non-integer or non-positive pages/copies, when submission validates, then it rejects before any database operation. *(unit)*
- **AC-607** — Given an active BW-only A4 printer, when COLOR or an unsupported paper size is submitted, then the server rejects it and writes nothing. *(integration)*
- **AC-608** — Given two orgs and active/default printers in each, when a member submits without a printer, then only the caller-org active default can be selected. *(integration)*
- **AC-609** — Given an admin creates, edits, archives, and defaults printers, when the repository persists them, then all CRUD fields and the per-org unique-name/single-default invariants hold. *(integration)*
- **AC-610** — Given a valid member request, when submission succeeds, then the job snapshots printer id, range, copies, mode, paper, duplex, document pages, and effective pages. *(integration)*
- **AC-611** — Given balance exactly below effective pages, when two submissions race, then at most one debit succeeds and no failed attempt leaves a job or ledger row. *(integration)*
- **AC-612** — Given a spoofed MIME body, an over-10-MB file, or a traversal filename, when upload validation runs, then it rejects or sanitizes before Storage and preserves the org path contract. *(unit)*
- **AC-613** — Given jobs for two users and two orgs, when member history is read, then it returns only the caller's 20 newest jobs and maps all five statuses. *(integration)*
- **AC-614** — Given persisted jobs with copies, discounts, printer, and timestamps, when the admin report renders, then rows show effective pages, gross/net money, discount, printer, and status from server data. *(unit)*
- **AC-615** — Given the lifecycle state machine, when each legal and illegal transition is evaluated, then only PENDING→PROCESSING, PROCESSING→READY/FAILED, READY→COMPLETED, and resolved FAILED→PROCESSING/COMPLETED are accepted. *(unit)*
- **AC-616** — Given an agent/admin marks a job PROCESSING, FAILED, READY, or COMPLETED, when the update commits, then processed/error/timestamp fields match the transition and invalid transitions do not write. *(integration)*
- **AC-617** — Given no configured key, a malformed key, or a wrong key, when the agent endpoint is called, then it returns 401 and does not query or disclose jobs. *(integration)*
- **AC-618** — Given identical-looking keys configured for separate orgs, when either key calls GET, then it receives only that key's org queue and cannot address another org. *(integration)*
- **AC-619** — Given pending and processing jobs with files, when authenticated GET requests `limit=500`, then at most 50 oldest jobs return with org-checked signed URLs. *(integration)*
- **AC-620** — Given each allowed agent status and an unknown status, when POST is called with a valid key, then allowed statuses are accepted subject to the state machine and unknown status is rejected. *(integration)*
- **AC-621** — Given a completed job and a retryable failed job, when agent POST updates them, then completed jobs cannot regress and failed jobs can retry only through PROCESSING. *(integration)*
- **AC-622** — Given more than 60 agent calls in one minute or a queue limit above 50, when the abuse guard runs, then excess calls are rejected/limited without leaking key or job data. *(integration)*
- **AC-623** — Given an admin edits any of six matrix cells, when the pricing repository writes, then the row is upserted for that org and another org's cell is unchanged. *(integration)*
- **AC-624** — Given a MEMBER or BARISTA session, when printer/pricing/key/status configuration is invoked, then it is denied server-side with no write. *(integration)*
- **AC-625** — Given a row in each print status and a nonzero discount, when the report mapper runs, then labels, tones, gross strike-through, net amount, and completion metadata are correct. *(unit)*
- **AC-626** — Given an org with no jobs, when `/admin/print-reports` renders, then the empty state appears and the table does not. *(unit)*
- **AC-627** — Given printer capability changes, when the member form renders, then COLOR and paper options are offered only when the selected printer allows them and submission remains server-gated. *(unit)*
- **AC-628** — Given a seeded org, when print packages are listed, then active packages are exactly 10/Rp10.000, 50/Rp45.000, and 100/Rp80.000 in sort order. *(integration)*
- **AC-629** — Given a selected package, when top-up succeeds, then its stored price is recorded, its pages are credited once, and one completed ledger row is written atomically. *(integration)*
- **AC-630** — Given an unknown, archived, or cross-org package id, when top-up runs, then it rejects with no balance or ledger change. *(integration)*
- **AC-631** — Given no authenticated member session, when print submission or top-up is invoked, then it fails closed and writes nothing. *(integration)*
- **AC-632** — Given rows in two orgs, when RLS and repository reads run under each org, then printers, pricing, jobs, agent configs, and packages from the other org are invisible. *(integration)*
- **AC-633** — Given concurrent admin default changes, when printer writes commit, then at most one active non-archived default exists per org. *(integration)*
- **AC-634** — Given a pre-I-043 flat pricing row and historic job, when the migration applies, then A4 values are preserved, missing A3/F4 rows are seeded, historic effective pages are backfilled, and no job is deleted. *(integration)*
- **AC-635** — Given org tier config REGULAR=0%, PREMIUM=5%, GOLD=10%, when a member submits, then the selected tier discount is applied without client influence. *(integration)*
- **AC-636** — Given any page range and copies, when totals run with duplex on or off, then effective sheets and price are identical; duplex is only persisted as an option. *(unit)*
- **AC-637** — Given completed and non-completed jobs, when report summary runs, then revenue is the sum of persisted net totals for COMPLETED jobs only and pages include effective sheets. *(integration)*
- **AC-638** — Given a newly generated agent key and a member document, when configuration and agent GET run, then only the hash is stored, the raw key is shown once, and a valid signed URL is returned only for the same org path. *(integration)*
- **AC-639** — Given the seeded member, when they upload a valid document, select a supported printer, submit, and revisit `/print`, then the job appears in history with its server-computed effective pages, price, and PENDING status. *(e2e)*

## Migration / schema delta

Keep the table name `org_print_pricing` to minimize repository and deployment churn, but transform it from one flat row per org into one row per `(org_id, color_mode, paper_size)`: `price_per_page_rupiah`, `is_active`, timestamps, unique `(org_id, color_mode, paper_size)`, and indexes on org plus lookup columns. Extend `PrintJobStatus` with `PROCESSING` and `FAILED`. Extend `print_jobs` with `page_range`, `total_pages` (effective sheets), nullable legacy `printer_id`, `error_message`, `processed_by`, `processed_at`, and `completed_at`; retain `pages` as document page count, `copies`, `duplex`, stored integer totals, and `storage_path`.

Add org-scoped `printers` (`name`, `display_name`, `location`, `printer_type`, `color_support`, `paper_sizes`, `is_active`, `is_default`, `sort_order`, `archived_at`, timestamps; unique `(org_id,name)`), `print_topup_packages` (`pages`, `price_rupiah`, active/sort/archive fields), and `print_agent_configs` (`org_id` unique, non-secret key selector, key hash, active flag, server name, last seen, timestamps). Add FK/indexes, int/money/quantity checks, and RLS policies for all three tables plus the changed print tables.

The ordered migration shall add/backfill nullable columns, map existing flat BW/COLOR values to A4 rows, create absent A3/F4 rows with the six seed defaults, set `page_range='all'` and `total_pages=pages×copies` for historic jobs, then enforce new-write invariants. Fresh seed shall upsert the six matrix rows and three print packages per org. It shall not delete historic jobs or silently price a missing combination.

## Divergences from ORIG

- Missing/inactive pricing fails submission instead of ORIG's silent Rp500 fallback.
- Upload magic bytes, allowlist, 10 MB cap, sanitized org path, conditional balance debit, and atomic job/ledger write remain mandatory; ORIG trusts client file/page metadata and performs non-atomic writes.
- Agent keys are org-scoped, hashed, selector-addressable, rate-limited, and fail closed when unset; ORIG stores a global plaintext setting.
- Printer names and every query are org-scoped; deletes are soft-archive/FK-safe rather than destructive global deletes.
- Tier discount remains server-resolved from FlowSpace tier configuration (REGULAR/PREMIUM/GOLD), not from client dashboard data.
