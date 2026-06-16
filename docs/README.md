# docs/ — index

The map for this repo's documentation. Start here when onboarding.

## Charter & binding docs
- **Project charter + DoD:** [`CLAUDE.md`](../CLAUDE.md) (terse, binding — symlinked as `AGENTS.md`) +
  [`product-expectations.md`](product-expectations.md) (the full per-layer Definition of Done).
- **Operating model (Owner → Director → role agents) + the per-issue loop:** [`director-playbook.md`](director-playbook.md).
- **UI/UX cycle (4-lens design review, mockup→build drift):** [`design-workflow.md`](design-workflow.md).
- **Delegation lane (pi + GLM to spare Claude quota):** [`pi-delegation.md`](pi-delegation.md).
- **Environments (Supabase CLI local stack = dev + test; prod = owner-gated):** [`environments.md`](environments.md).
- **Glossary / JTBD:** [`glossary.md`](glossary.md), [`jtbd.md`](jtbd.md).
- **Roadmap:** [`backlog.md`](backlog.md).

## Current stack
**Supabase (Postgres + Auth + Realtime + Storage + RLS) + Drizzle ORM, server-authoritative.** Prisma / Neon /
NextAuth were removed in I-005. The authoritative record:
- **ADR-0013** — backend platform (Supabase + Drizzle + Supabase Auth).
- **ADR-0014** — auth (Supabase Auth; supersedes ADR-0003; revises ADR-0004's session source).
- **ADR-0015** — data layer (Drizzle + ordered `supabase/migrations/`; RLS as backstop).

## Per-issue lifecycle
Intake → Spec (`specs/`) → Plan (`plans/`) → Build (TDD) → Review (spec + quality + security) → Accept (BDD) →
Design re-review (FE only) → Ship. One issue, one branch, one PR.

## Specs, plans, ADRs
- **Specs:** [`specs/`](specs/) — `OBS-###`/`FR-###`/`NFR-###` + Given/When/Then `AC-###`.
- **Plans:** [`plans/`](plans/) — dated implementation plans. Superseded plans are bannered in place (not moved).
- **ADRs:** [`adr/`](adr/) — see [`adr/README.md`](adr/README.md) for the status index.
