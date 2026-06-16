# ADR-0010 — Test strategy: the pyramid, one owning layer per AC

- Status: Accepted
- Date: 2026-06-15
- Revised: 2026-06-16 (I-005 re-platform — test DB is now the Supabase CLI local stack; see below).

## Context
Every acceptance criterion (`AC-###`) needs exactly one canonical, grep-able proof, at the cheapest layer that can
honestly prove it. Over-using e2e is slow and flaky; under-using it misses real cross-stack behavior.

## Decision
Three layers; each `AC-###` is owned by **one** test at the **lowest sufficient layer**:
- **Unit** — Vitest + Testing Library, mocked. Logic, component render (loading/empty/error/filter), formatters, `can()` policy.
- **Integration** — Vitest against a **throwaway test Postgres**. Tenancy (`org_id` scoping), role read+write
  contracts, repository behavior, server-side authz, RLS backstop. (Replaces the PMO template's pgTAP, per ADR-0001.)
- **E2E** — Playwright, ~6–8 curated cross-stack journeys only. Real user flows end-to-end.

**Traceability:** the owning test names its `AC-###` in the test title; Playwright files are `e2e/<AC-id>-<slug>.spec.ts`.
`grep -r AC-XXX` finds the canonical proof. An AC may be referenced at multiple layers but has exactly one owning
layer, recorded in the plan's traceability table. **Never push an AC up a layer to satisfy a convention** — coverage
is never lost.

**Coverage gate:** ≥80% lines on changed code, behavior-asserting. Enforced via Vitest coverage in CI (a
changed-lines-precise gate is a future enhancement — see backlog).

## Consequences
- Fast, honest suite; e2e reserved for what only e2e can prove.
- Integration tests need a disposable Postgres — provided by Docker locally and the **Supabase CLI local stack** in CI/preview (per the I-005 revision below).
- **Reinforcement (2026-06-16, I-004 rebalance):** e2e is reserved for genuine cross-stack-only guarantees
  (e.g. content-absence after a real HTTP redirect). Authorization *decision* logic (`requiredRolesFor`,
  `authorized`, `roleHome`) belongs at unit — it is pure function logic that does not require a browser or a
  live server. Moving decision ACs down to unit keeps the e2e suite to ~3 curated journeys per feature.
- **Revision (2026-06-16, I-005 re-platform):** the throwaway integration/e2e Postgres is now the **Supabase CLI
  local stack** (`supabase start`) — a real Postgres + Auth + Storage + Realtime locally, used for dev, integration
  tests, and e2e. CI runs the same local stack (or a Postgres-service + applied-migrations equivalent). The
  `TEST_DATABASE_URL`/`DATABASE_URL` seam, the serial integration project, and the one-owning-layer rule are
  unchanged. New backstop layer assignment: the **RLS isolation proof** (cross-org row invisible under a scoped
  role) is an **integration** test; Realtime/Storage **seam smoke tests** are integration (they touch the local
  Supabase services). The auth session-claims mapper (AC-020) and route/policy logic stay **unit**.
