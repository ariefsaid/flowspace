# ADR-0013 — Backend platform: Supabase (server-authoritative) + Drizzle + Supabase Auth

- Status: Accepted
- Date: 2026-06-16
- Supersedes: the **stack/backend** half of [ADR-0001](0001-stack-nextjs-prisma-neon.md); revises [ADR-0003](0003-auth-nextauth-credentials.md) (auth) and the test-DB assumptions in [ADR-0010](0010-test-strategy-pyramid.md). Frontend stack (Next.js 15 App Router + React 19 + Tailwind) and the agentic SDD/TDD/BDD workflow are unchanged.
- Decision method: a `grill-with-docs` session (2026-06-16) that derived the backend requirements from the frontend's expected functionality, then converged.

## Context
ADR-0001 chose Next.js + Prisma + Postgres(Neon) + NextAuth for a **frontend-first replica**. Re-evaluating at day 1 (the project is ~1 day old — minimal sunk cost), the product's real shape changes the backend calculus:

- **Production, managed-service** — the **Operator** runs the platform *for* the venue (NOT self-serve multi-tenant SaaS); **single-operator, multi-location** under one platform; **ESB/ERP integration expected later** (see glossary).
- Functionality derived from the recon UI demands managed primitives + heavy server logic:
  - **Realtime (required):** the barista KDS live queue + "Sound On" new-order alert, and live admin dashboards.
  - **Storage:** print-document uploads (PDF/Word/Excel/PPT/images).
  - **Auth + roles:** member/admin/barista, likely email-verify/OAuth/phone-OTP later.
  - **Location isolation (`org_id`):** defense-in-depth across locations under one operator.
  - **Server-heavy logic + external/hardware integrations:** ledgers (time-credit/print), payment gateway (PAID ONLINE), PaperCut print billing, UniFi WiFi vouchers, dynamic-QR door/print access — LAN devices reached via a **per-venue on-prem agent**.

The integration/ledger/agent half means the system is **server-authoritative** regardless of platform, which neutralises the "Supabase client + RLS does everything" accelerator — but the managed primitives (Realtime/Storage/Auth/RLS) still map 1:1 to the requirements.

## Decision
Adopt **Supabase** as the managed backend platform, accessed **server-side**:
- **Supabase Postgres + Realtime + Storage + Auth + RLS.** (Self-host-capable, which keeps the data-residency / self-host option open — unlike Neon.)
- **Drizzle ORM**, server-side, behind the existing `lib/db/*` repository seam (edge-friendly, clean per-request RLS/JWT context).
- **Supabase Auth** for authentication + roles; it also authorises Realtime channels and RLS policies.
- **Server-authoritative API** (Next.js route handlers / server actions) is the **enforcement authority**; **RLS is a defense-in-depth backstop**, not the primary gate. `org_id` scopes by **location** under one operator.
- A **per-venue on-prem agent** bridges LAN hardware (printer/PaperCut/UniFi/door) to the cloud API; the **ESB/ERP integration seam** is server-side.

## Consequences
- **Carries over unchanged:** the DB schema (ported to Drizzle), all UI, the domain logic (`lib/cafe/*` pricing/status/eligibility), and the whole agentic workflow + specs/ADRs/tests.
- **Rework (the re-platform issue, I-005):** auth NextAuth→Supabase Auth (re-do I-004's surface, link app users to `auth.users`); data layer Prisma→Drizzle on Supabase; CI bare-Postgres service → Supabase local stack; add RLS policies + Realtime/Storage seams.
- **The in-flight `feat/cafe-domain` (Prisma/NextAuth) is shelved** — preserved (pushed, unmerged), not finished on the old stack. Its spec (`0003-cafe-domain`), plan, tests, and domain logic carry over; the cafe wiring is rebuilt on the new foundation after I-005.
- **Deferred seams — each gets its own ADR/issue when it lands:** payments gateway (Midtrans/Xendit?), the on-prem agent protocol, PaperCut/print source-of-truth, UniFi voucher integration, dynamic-QR door access, ESB/ERP connectors, and the final self-host-vs-cloud + Indonesia data-residency call.
- Lock-in: deeper Supabase coupling (Auth/Realtime/Storage) — accepted, mitigated by keeping a server-side repository seam and Drizzle (portable SQL) so the DB layer stays movable.
