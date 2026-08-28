# ADR-0016 — Tier model: enum + org-scoped config over dynamic tier CRUD (DIV-1)

- **Status:** Accepted (I-041)
- **Date:** 2026-08-28
- **Spec:** 0008 (tier-model correction), supersedes the relevant spec-0006 surface.
- **Decisions linked:** ADR-0010 (test pyramid), ADR-0011 (cafe eligibility seam), ADR-0015 (Drizzle/RLS on Supabase).

## Context

The original product (ORIG) models membership tiers as a **global dynamic collection**: an admin CRUDs
arbitrary tier rows, each carrying a unique name, display metadata (display name, color, description, active,
sort order), and four percentage discount fields (coworking / meeting / cafe / print). User→tier matching is by
free-text string, and the seed defines the three canonical tiers (base / mid / top at 0/0/0/0, 10/10/5/5,
15/15/10/10, ordered coworking/meeting/cafe/print).

FlowSpace is **single-venue with a forward-compatible `org_id` tenancy seam**. The current implementation
already uses a fixed `MembershipTier` enum (`REGULAR | PREMIUM | GOLD`) plus an org-scoped
`membership_tier_config` table (one row per `(org_id, tier)`), holding only two dimensions (cafe, print) with
guess seed values. I-041 must widen the model to all four dimensions and correct the seed — and must decide
whether to also adopt ORIG's dynamic-tier CRUD.

## Decision

**Retain the fixed enum `REGULAR | PREMIUM | GOLD` and the org-scoped `membership_tier_config` table (one row
per `(org_id, tier)`), widened to the four locked integer percentages.** This is recorded as **DIV-1**: a
deliberate divergence from ORIG's dynamic tier table. ORIG's base/mid/top map to `REGULAR/PREMIUM/GOLD`
respectively.

We do **not** build dynamic tier CRUD (create arbitrary tier, rename, delete-with-referencing-user-count,
sort-order/color/description metadata, free-text matching). Dynamic tiers are deferred until multi-venue or
franchise requirements actually justify them; until then the enum preserves JWT/app-metadata semantics and the
existing org seam.

### Consequences

**Positive**

- Minimal migration risk: one widening migration (`0010_tier_model.sql`) that adds two columns, rewrites
  existing rows, and leaves the enum, indexes, and RLS untouched.
- The `MembershipTier` enum remains a compile-time type and rides in `app_metadata`; no free-text string
  matching and no type-unsafe tier lookups.
- `org_id`-scoped rows retain the server-side tenancy backstop; one org's config can never leak to or be
  mutated by another.
- Fewer moving parts in the config editor and pricing paths; the four dimensions share one validation gate.

**Costs / trade-offs**

- Admins cannot add a bespoke tier or brand a custom display name/color from the UI; the model is capped at
  three tiers until a later ADR.
- ORIG behaviors that depend on the dynamic collection (OBS-506..510: create/update/delete/list with display
  metadata and sort order, delete-with-referencer-count) are intentionally out of scope and un-followed.
- Adding a tier later is a schema + code change (enum, migration, seed, editor) rather than a data-only row
  insert.

**Follow-up:** revisit dynamic tiers only when a concrete multi-venue/franchise requirement lands, after a fresh
ADR. ORIG's POS hardcoded-15% defect (DIV-2, spec 0008) is out of scope here.