# Product Expectations & Definition of Done (binding charter)

This document is **binding on the Director and all role agents**. **Part A is the product charter — the
owner's expectations, verbatim** (identical across the owner's projects: PMO, gordi-MOS, FlowSpace). Parts B–E
are this repo's per-layer Definition of Done and cross-cutting policy. `CLAUDE.md` carries the enforced summary;
this file is the full source of truth. Scale each section to the issue's complexity, but never skip a layer's
DoD silently.

---

## Part A — Product charter (verbatim)

### Director / Orchestrator
Before delegating, or after receiving work from subagents:
- Ask clarifying questions
- Challenge bad decisions
- Identify scaling risks
- Suggest better approaches
- Prioritize simplicity

Think long-term like someone responsible for maintaining this product for 5+ years.

Then provide:
- Technical decisions
- Tradeoff analysis
- Recommended architecture
- Implementation plan
- Production-ready solution

### Architecture
From a Product Architecture perspective: build a production-ready startup MVP. Design a scalable
production-grade system architecture. Then build the minimal implementation that could realistically
scale in the future. Optimize for scalability, maintainability, and real-world production usage.

Include: system architecture · component structure · file structure · data flow · database schema ·
API endpoints · caching strategy · UI architecture · production-ready code.

Build it like a real startup — as minimal as viably possible to cater for 1 client, but scalable to
cater to millions of users in mind.

### Existing repo
Since it's an existing repo, reverse-engineer the architecture and understand the complete data flow.
Then identify: bad architecture decisions · duplicate logic · performance bottlenecks · scalability
risks · maintainability issues.
Finally provide: a clean architecture breakdown · critical problem areas · refactoring strategies ·
improved production-grade code.
**Do not change functionality. Only upgrade code quality, scalability, and maintainability.**

### Performance
Keep in mind for performance optimization — if not at the start, at least aspirationally.
Goals: maximum speed · lower memory usage · better scalability · faster rendering · cleaner execution.
Identify: performance bottlenecks · inefficient logic · unnecessary rendering · expensive operations ·
memory leaks.
Provide: performance issue breakdown · optimization strategies · improved production-ready code ·
scalability recommendations.

### Frontend
Build production-grade UI systems for a modern startup. Create: reusable UI components · scalable
component architecture · accessible production-ready interfaces.
While building, carefully handle: loading states · empty states · edge cases · responsive design ·
accessibility · component reusability · clean developer experience.
Provide: component architecture · props/API design · production-ready implementation · usage examples ·
best practices.

### Debugging
Act like a senior debugging engineer investigating a live production issue. Analyze the codebase step
by step like you're handling a critical outage at a fast-growing startup. Your job: understand what
the code actually does · trace the real root cause · explain why the failure happens · identify hidden
edge cases · propose the most robust fix possible.
Provide: code functionality breakdown · root cause analysis · failure explanation · edge case analysis ·
fixed production-ready code. **Do not guess. Think deeply before making changes.**

### Security
Carefully inspect the system for: security vulnerabilities · authentication flaws · API weaknesses ·
injection risks · sensitive data exposure · infrastructure risks.

### DevOps & deployment
Keep in mind — if not for MVP, at least aspirationally: design deployment architecture · configure
CI/CD · set up monitoring/logging · improve reliability · reduce downtime risks · optimize scaling.
Provide: infrastructure architecture · deployment workflow · CI/CD pipeline · Docker/Kubernetes setup ·
monitoring strategy · production deployment checklist.

---

## Part A.1 — Product context (FlowSpace, this repo)
The Part A charter above is product-agnostic (the owner's standing expectations). This repo's product instance:

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
  handlers → typed **Drizzle** **repositories** (`lib/db/*`) → Supabase Postgres. No raw SQL or `org_id` threaded from the client.
- **Correctness.** Every `AC-###` proven by a test at its lowest sufficient layer (ADR-0010). Handle **loading /
  empty / error / edge** states, not just the happy path.
- **Security.** Server-side authz is the enforcement authority: every business read/write is `org_id`-scoped and
  ownership/role-checked server-side. No secrets in code/history. (See `security-auditor`.)
- **Data/schema.** Ordered Supabase migrations (`supabase/migrations/`; `pnpm exec supabase db reset` re-applies fresh — the CLI has no down-migration concept). Indexes on hot-path `WHERE`/`JOIN`/`ORDER BY` columns. No N+1,
  no unbounded scans, no `select *` over wide rows on hot paths. Soft-archive over hard-delete; FK-block referenced rows.
- **Performance.** No needless re-renders, expensive synchronous work, or leaks on the FE; bounded queries on the BE.
- **Quality gates (block merge).** `pnpm typecheck` 0 errors · ESLint `--max-warnings=0` · Vitest unit green with
  **≥80% lines on changed code** (behavior-asserting, not number-inflating) · `pnpm build` green · curated
  Playwright e2e green for the issue's journeys.

## Part C — Design / UI DoD (FE-affecting issues)
- `DESIGN.md` (reverse-engineered from the original) is the **single source of truth** for tokens — colors,
  type, spacing, radius, elevation. **No raw hex/px in components** — name the token.
- Per-UI flow: **design-plan → mockup (round-1 4-lens review) → implement → rendered round-2 4-lens review** before merge.
  The **4-lens battery** is: **Lens A — Visual / correctness · Lens B — IxD / task-flow naturalness · Lens C —
  IA / structure · Lens D — Product / Intent (JTBD)**; all four run at both rounds; `design-reviewer` owns all four.
- Every component ships **all states** (loading/empty/error/edge), **responsive** breakpoints, and **WCAG-AA**
  a11y (contrast, focus order/visibility, labels/roles, keyboard paths).
- **Replica fidelity.** The built UI is diffed against the captured original (pixel + interaction). Drift is a defect.
- Identity preservation: never invent a new brand/palette/font — surface the original's system as tokens.

## Part D — DevOps & delivery DoD
- One PR per issue. No force-push, no `git add -A`. No push without fresh green verification evidence.
- Ordered Supabase migrations; production deploy + irreversible infra require **owner** approval.
- CI runs typecheck, lint, unit (coverage), build, and e2e on every PR.

## Part E — Replica acceptance (this project specifically)
A replica issue is **done** when: (1) the recon spec's `OBS-###`/`AC-###` for that surface are captured from the
live product; (2) the implementation passes them at the owning test layer; (3) the rendered UI matches the
captured original within the design-reviewer's pixel/interaction tolerance; (4) all Part B/C gates are green; and
(5) no client-identifying brand content is committed (Part: masking — `brand.config.ts` + env only).
