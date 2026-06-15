# ADR-0002 — White-label brand seam (public-repo masking)

- Status: Accepted
- Date: 2026-06-15

## Context
This is a **public** GitHub repo replicating a **client's** product. The client's real brand name, logo, domain,
and member-tier names must not be discoverable in the committed code or history. A masked repo *name* is not enough
if the code says the client's brand everywhere.

## Decision
All brand-identifying content is sourced from a **white-label seam**, never hardcoded:
- `brand.config.ts` reads `NEXT_PUBLIC_BRAND_NAME`, tagline, locale, and brand colors from env, with **generic
  defaults** (codename "FlowSpace"). Components render `brand.*`, never a literal client name.
- Member-tier names, copy, and logos are config/env-driven (and, where dynamic, DB-driven per `org_id`).
- The real brand values live only in deployment env (Vercel/host) and are **never committed**.
- Recon screenshots that contain client branding are stored outside the repo (gitignored: `/review/`, `.playwright-mcp/`).

## Consequences
- The public repo reads as a generic coworking+cafe platform; the client is not identifiable from code.
- A literal client brand string in a diff is a **defect** (reviewers reject it).
- Re-skinning to another venue is just env — supports the multi-venue (`org_id`) future.
