# Plan — Admin print reports (real data) · I-026 · 2026-06-21

Spec: `docs/specs/0005-admin-print-reports.spec.md`. Pattern: mirror `app/(admin)/admin/bookings/page.tsx`
(RSC `requireSession` → org-scoped repo read → `findProfilesByIds` → View[] → client leaf). Reuse the existing
static markup in `app/(admin)/admin/print-reports/page.tsx` verbatim for pixels; swap the data source.

## Tasks

1. **Repo query + int test** — `lib/db/print.ts`: add
   `listPrintJobsForAdmin(orgId): Promise<PrintJob[]>` (org-scoped, `ORDER BY created_at DESC`). Reuse
   `findProfilesByIds` in the page for names (don't re-join in the repo — matches bookings).
   - `lib/db/print.int.test.ts`: **AC-300** (org A vs B isolation, newest-first) + **AC-301** (aggregates: the page
     derives jobs/pages/users/revenue — assert the row set the derivation runs on is correct and COMPLETED-revenue
     sums right). Verify cmd: `pnpm vitest run lib/db/print.int.test.ts`.

2. **Presentational module + unit test** — extract the pure mappers into the client leaf (or a small helper):
   `colorModeLabel(BW|COLOR)`, `discountPercent(discountRupiah, totalRupiah)`, `statusLabel`/`statusTone` for the
   real 3-status enum (`PENDING→Menunggu/pending`, `READY→Siap Ambil/active`, `COMPLETED→Selesai/completed`).
   - Unit (**AC-302**, **AC-303**): render the client with fixture rows → assert labels/%/strikethrough/empty state.
     Verify cmd: `pnpm vitest run app/(admin)/admin/print-reports`.

3. **RSC + client refactor** — split the page:
   - `page.tsx` → RSC: `requireSession()`, `listPrintJobsForAdmin(orgId)`, `findProfilesByIds(orgId, ids)`, map to
     `AdminPrintJobView[]` (name, fileName, pages, colorMode, paperSize, discountRupiah, grossRupiah=total+discount,
     netRupiah=total, createdAt ISO, status), compute the 4 summary numbers, pass to `PrintReportsClient`.
   - `PrintReportsClient.tsx` → the existing static JSX, now props-driven (DESIGN tokens unchanged).
   - Delete the hardcoded `adminPrintJobs` mock.
   - Verify: `pnpm typecheck && pnpm lint:ci`.

## DoD
typecheck 0 / lint 0 / unit + int green / 3-reviewer battery + design re-review (rendered) clean. Read-only page;
org-scoped; no client `orgId`. Revenue = Σ `totalRupiah` of `COMPLETED`.
