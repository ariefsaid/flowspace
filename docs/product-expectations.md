# Product Expectations & Definition of Done (binding charter)

Binding on **every** agent and on the Director. This is the contract for "production-grade." Scale each section
to the issue's complexity, but never skip a layer's DoD silently.

## Part A — Product charter
FlowSpace is a **single-venue smart coworking + cafe SaaS**, architected behind an `org_id` seam so it can grow
to **multi-venue / franchise** without a rewrite. It is a **faithful replication** of an existing live product:
where the original defines behavior or pixels, the original wins — captured as `OBS-###` observations and
`AC-###` acceptance criteria in the recon specs. Net-new behavior (not in the original) is `FR-###`, and must be
owner-approved before build.

**Primary roles:** Member (books rooms, buys time-credit packages, orders cafe, prints), Guest (cafe order only),
Admin/Operator (dashboard, users, bookings, pending approvals, cafe POS, orders, print reports, settings).

**Core domains:** time-credit ledger · room/seat booking · cafe menu + ordering + POS · print billing
(PaperCut-style) · dynamic-QR access · tiered memberships & discounts · payments/transactions.

## Part B — Engineering DoD (every code issue)
- **Architecture.** Production-grade and minimal for one venue, yet scalable. 3-layer seam: components/route
  handlers → typed Prisma **repositories** (`lib/db/*`) → Postgres. No raw Prisma or `org_id` threaded from the client.
- **Correctness.** Every `AC-###` proven by a test at its lowest sufficient layer (ADR-0010). Handle **loading /
  empty / error / edge** states, not just the happy path.
- **Security.** Server-side authz is the enforcement authority: every business read/write is `org_id`-scoped and
  ownership/role-checked server-side. No secrets in code/history. (See `security-auditor`.)
- **Data/schema.** Reversible Prisma migrations. Indexes on hot-path `WHERE`/`JOIN`/`ORDER BY` columns. No N+1,
  no unbounded scans, no `select *` over wide rows on hot paths. Soft-archive over hard-delete; FK-block referenced rows.
- **Performance.** No needless re-renders, expensive synchronous work, or leaks on the FE; bounded queries on the BE.
- **Quality gates (block merge).** `pnpm typecheck` 0 errors · ESLint `--max-warnings=0` · Vitest unit green with
  **≥80% lines on changed code** (behavior-asserting, not number-inflating) · `pnpm build` green · curated
  Playwright e2e green for the issue's journeys.

## Part C — Design / UI DoD (FE-affecting issues)
- `DESIGN.md` (reverse-engineered from the original) is the **single source of truth** for tokens — colors,
  type, spacing, radius, elevation. **No raw hex/px in components** — name the token.
- Per-UI flow: **design-plan → mockup (round-1 4-lens review) → implement → rendered round-2 4-lens review** before merge.
- Every component ships **all states** (loading/empty/error/edge), **responsive** breakpoints, and **WCAG-AA**
  a11y (contrast, focus order/visibility, labels/roles, keyboard paths).
- **Replica fidelity.** The built UI is diffed against the captured original (pixel + interaction). Drift is a defect.
- Identity preservation: never invent a new brand/palette/font — surface the original's system as tokens.

## Part D — DevOps & delivery DoD
- One PR per issue. No force-push, no `git add -A`. No push without fresh green verification evidence.
- Reversible migrations; production deploy + irreversible infra require **owner** approval.
- CI runs typecheck, lint, unit (coverage), build, and e2e on every PR.

## Part E — Replica acceptance (this project specifically)
A replica issue is **done** when: (1) the recon spec's `OBS-###`/`AC-###` for that surface are captured from the
live product; (2) the implementation passes them at the owning test layer; (3) the rendered UI matches the
captured original within the design-reviewer's pixel/interaction tolerance; (4) all Part B/C gates are green; and
(5) no client-identifying brand content is committed (Part: masking — `brand.config.ts` + env only).
