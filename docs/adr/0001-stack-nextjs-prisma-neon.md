# ADR-0001 — Stack: Next.js + Prisma + Postgres (Neon)

- Status: **Superseded (backend) by [ADR-0013](0013-backend-platform-supabase.md)** — the frontend stack (Next.js 15 / React 19 / Tailwind) stands; the Prisma + Neon + NextAuth backend is replaced by Supabase + Drizzle + Supabase Auth (server-authoritative). Accepted 2026-06-15.
- Date: 2026-06-15

## Context
We are replicating an existing live product (a coworking + cafe SaaS). Recon confirms the original is a **Next.js
App Router** app (`/_next/` chunks, `main-app`, `next/font`) — abacus.ai's standard output, backed by Postgres.
We have no source; behavior and pixels are reverse-engineered. The owner's existing agentic SDD/TDD/BDD workflow
(the "PMO" template) is stack-agnostic except for the data layer.

## Decision
Build the replica on **Next.js 15 (App Router) + React 19 + TypeScript**, **Tailwind CSS v4**, **Prisma ORM** over
**Postgres on Neon**, with **NextAuth/Auth.js v5** for auth. Use **pnpm**. The app lives at the repo root.

## Consequences
- **Pixel/behavior fidelity is easier** — same framework, SSR/RSC model, and `next/font` as the original.
- The data layer diverges from the PMO template's Supabase/pgTAP. We adopt a **Prisma repository seam** (`lib/db/*`)
  and enforce authorization **server-side** (route handlers / server actions, `org_id`-scoped queries); Postgres RLS
  on Neon is optional defense-in-depth (see ADR-0003).
- The test pyramid's integration layer is **Vitest + Prisma against a throwaway test Postgres**, not pgTAP (ADR-0010).
- Neon branches give per-environment isolation (`docs/environments.md`).
