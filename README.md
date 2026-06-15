# FlowSpace

A production-grade **smart coworking + cafe** platform: time-credit booking, meeting/coworking room
reservations, an integrated cafe POS with guest ordering, print billing, dynamic-QR facility access, and
tiered memberships. Built **spec-first** with an agentic SDD / TDD / BDD workflow.

> **White-label.** The product name, logo, member-tier names, copy, and colors are driven by
> `brand.config.ts` + `NEXT_PUBLIC_*` env. Code defaults are generic ("FlowSpace"); branding is supplied at
> deploy time and is never committed.

## Stack
- **Next.js 15** (App Router) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS v4**
- **Prisma** + **Postgres** (Neon) · **NextAuth/Auth.js v5**
- **Vitest** + Testing Library (unit) · **Playwright** (e2e / BDD)
- Locale: Bahasa Indonesia (`id-ID`)

## Quick start
```bash
pnpm install
cp .env.example .env        # fill DATABASE_URL (Neon), NEXTAUTH_SECRET, ...
pnpm db:migrate             # apply schema to your dev DB
pnpm dev                    # http://localhost:3000
```

## Scripts
| Command | Purpose |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js dev / production build / serve |
| `pnpm typecheck` | `tsc --noEmit` (zero errors to merge) |
| `pnpm lint:ci` | ESLint `--max-warnings=0` (zero to merge) |
| `pnpm test` / `test:coverage` | Vitest unit (≥80% on changed code to merge) |
| `pnpm e2e` | Playwright acceptance (the BDD layer) |
| `pnpm db:migrate` / `db:deploy` / `db:studio` | Prisma migrations / deploy / studio |

## How this repo is built (agentic workflow)
Owner → **Director** (main session) → role agents, one issue at a time:

**Intake → Spec (SDD) → Design+Plan → Build (TDD) → Review (spec + quality + security) → Accept (BDD) → Design re-review → Ship.**

- Role agents: `.claude/agents/` (mirrored to `.codex/agents/` via `scripts/sync-agent-surfaces.mjs`).
- Project charter & DoD: [`docs/product-expectations.md`](docs/product-expectations.md).
- Orchestration runbook: [`docs/director-playbook.md`](docs/director-playbook.md).
- UI/UX cycle (4-lens design review): [`docs/design-workflow.md`](docs/design-workflow.md).
- Specs (EARS + Given/When/Then `AC-###`): [`docs/specs/`](docs/specs/) · Plans: [`docs/plans/`](docs/plans/) · ADRs: [`docs/adr/`](docs/adr/).

### One-time setup after clone
Third-party Claude Code skills are gitignored; re-vendor them:
```bash
./scripts/vendor-skills.sh
```

## License
Private client work — all rights reserved.
