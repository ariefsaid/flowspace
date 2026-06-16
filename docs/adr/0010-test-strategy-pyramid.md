# ADR-0010 — Test strategy: the pyramid, one owning layer per AC

- Status: Accepted
- Date: 2026-06-15

## Context
Every acceptance criterion (`AC-###`) needs exactly one canonical, grep-able proof, at the cheapest layer that can
honestly prove it. Over-using e2e is slow and flaky; under-using it misses real cross-stack behavior.

## Decision
Three layers; each `AC-###` is owned by **one** test at the **lowest sufficient layer**:
- **Unit** — Vitest + Testing Library, mocked. Logic, component render (loading/empty/error/filter), formatters, `can()` policy.
- **Integration** — Vitest + Prisma against a **throwaway test Postgres** (local Docker or a Neon test branch).
  Tenancy (`org_id` scoping), role read+write contracts, repository behavior, server-side authz. (Replaces the PMO
  template's pgTAP, per ADR-0001.)
- **E2E** — Playwright, ~6–8 curated cross-stack journeys only. Real user flows end-to-end.

**Traceability:** the owning test names its `AC-###` in the test title; Playwright files are `e2e/<AC-id>-<slug>.spec.ts`.
`grep -r AC-XXX` finds the canonical proof. An AC may be referenced at multiple layers but has exactly one owning
layer, recorded in the plan's traceability table. **Never push an AC up a layer to satisfy a convention** — coverage
is never lost.

**Coverage gate:** ≥80% lines on changed code, behavior-asserting. Enforced via Vitest coverage in CI (a
changed-lines-precise gate is a future enhancement — see backlog).

## Consequences
- Fast, honest suite; e2e reserved for what only e2e can prove.
- Integration tests need a disposable Postgres — provided by Docker locally and a Neon branch in CI/preview.
- **Reinforcement (2026-06-16, I-004 rebalance):** e2e is reserved for genuine cross-stack-only guarantees
  (e.g. content-absence after a real HTTP redirect). Authorization *decision* logic (`requiredRolesFor`,
  `authorized`, `roleHome`) belongs at unit — it is pure function logic that does not require a browser or a
  live server. Moving decision ACs down to unit keeps the e2e suite to ~3 curated journeys per feature.
