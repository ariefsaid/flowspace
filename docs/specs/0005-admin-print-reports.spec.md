# Spec 0005 — Admin print reports (real data)

- Status: Built (I-026)
- Depends on / supersedes recon: `OBS-035` (spec 0001 — admin "Laporan Print" surface).
- Source of behavior: the static `/admin/print-reports` mock (pixels) + the live `print_jobs`/`transactions` domain (data).
- Owner decision (2026-06-21): **build for real.** The current live product redirects `/admin/print-reports → /dashboard`
  (re-recon 2026-06-21); the owner chose to ship a real admin print-billing surface over the shipped print domain
  rather than match the redirect. This spec records that divergence.

## Scope
**In:** wire the existing static `/admin/print-reports` page to live, org-scoped `print_jobs` data (per-user print jobs
with billing detail) + summary aggregates. ADMIN-only (already enforced server-side by `middleware.ts`).
**Out:** print-job mutations from this page (read-only report); CSV/PDF export; date-range filtering; pagination
(MVP renders the org's jobs newest-first — revisit if volume warrants, tracked as a follow-up).

## Data
`print_jobs` already carries every field the report needs (`0006_domain_verticals`): `fileName`, `pages`, `copies`,
`colorMode` (`BW`/`COLOR`), `paperSize`, `discountRupiah`, `totalRupiah`, `status` (`PENDING`/`READY`/`COMPLETED`),
`createdAt`, `userId`. The member display name joins from `app_users` (org-scoped, like the admin bookings page).

## Functional requirements (EARS)
- **FR-300** (ubiquitous) — The report *shall* read print jobs **scoped to the caller's `orgId`** (resolved
  server-side from the session); the client *shall never* supply `orgId`. (Tenancy seam.)
- **FR-301** (event-driven) — *When* an ADMIN opens `/admin/print-reports`, the system *shall* render every org
  print job newest-first with: member name, file name, pages, color mode, paper size, discount, net charge (with the
  gross struck through when a discount applies), timestamp, and status.
- **FR-302** (ubiquitous) — Summary tiles *shall* be computed server-side from the same org-scoped rows: total jobs,
  total pages, distinct users, and print revenue (= Σ `totalRupiah` of `COMPLETED` jobs).
- **FR-303** (state-driven) — *While* the org has no print jobs, the system *shall* render the empty state (not a
  zeroed table).
- **NFR-300** (ubiquitous) — All monetary fields *shall* be integer Rupiah from the persisted job (never recomputed
  or client-supplied); the displayed discount **%** is derived for presentation only (`round(discount/gross*100)`).

## Acceptance criteria (Given/When/Then)
- **AC-300** — Org-scoped listing. *Given* print jobs in org A and org B, *When* `listPrintJobsForAdmin(orgA)` runs,
  *Then* only org-A jobs return, newest-first, each with its member name attached. (FR-300, FR-301) — **Integration**.
- **AC-301** — Summary aggregates. *Given* a known set of org-A jobs, *When* the admin report loads, *Then* total
  jobs, total pages, distinct users, and revenue (Σ `totalRupiah` of `COMPLETED`) match the rows. (FR-302) — **Integration**.
- **AC-302** — Row presentation mapping. *Given* a job row, *When* the table renders it, *Then* `colorMode` shows as
  `Warna`/`B/W`, the discount shows as a derived `%` (or `—` when zero), the net charge shows with the gross struck
  through only when discounted, and the status maps to its Indonesian label/tone. (FR-301, NFR-300) — **Unit**.
- **AC-303** — Empty state. *Given* an org with zero print jobs, *When* the page renders, *Then* the empty state
  shows and no table is rendered. (FR-303) — **Unit**.

## Traceability (owning layer per ADR-0010)
| AC | Owning layer | Why |
|----|--------------|-----|
| AC-300 | Integration (Drizzle vs Supabase local) | org-scoping contract at the data layer (`lib/db/print.int.test.ts`) |
| AC-301 | Integration (Drizzle vs Supabase local) | `getPrintReportSummary` aggregates in SQL (uncapped) — exact totals proven against the DB (`lib/db/print.int.test.ts`) |
| AC-302, AC-303 | Unit (Vitest/RTL) | pure presentational mapping (`toView`/mappers) + empty-state render |

Admin authz (non-admin → redirect) is already owned by `e2e/AC-010-server-side-authz.spec.ts` — not re-proven here.
