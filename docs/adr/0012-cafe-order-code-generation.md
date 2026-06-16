# ADR-0012 — Cafe order code: per-org random short token

- Status: Accepted
- Date: 2026-06-16
- Issue: I-022 (cafe domain)

## Context
`OBS-034` (`/admin/orders`) shows orders identified by short lowercase codes rendered `#vohwrk`, `#0339xu`, `#v9smde`,
`#wno2cz`, `#okr5ky`, `#v2vzoa` — 6 lowercase alphanumerics. The barista KDS (`OBS-120/121`) and member "Pesanan
Terakhir" panel show the same code as the human-facing order reference. We need a code that is: short, opaque (not a
guessable sequential id that leaks order volume across tenants), unique within a tenant, and cheap to generate.

## Decision
1. **Format.** A 6-character lowercase base36 token (`[0-9a-z]`), surfaced to the UI with a leading `#`
   (`#` + token). Generation lives in `lib/cafe/status.ts#generateOrderCode()` (pure, injectable RNG for tests).
2. **Uniqueness is per-org, enforced by the DB.** `CafeOrder` has `@@unique([orgId, code])`. `createOrder` generates a
   code and inserts inside the transaction; on a unique-violation it retries with a fresh code, **bounded to 5
   attempts**, then throws. 36^6 ≈ 2.2 billion tokens per org makes a collision astronomically unlikely at MVP volume;
   the retry is belt-and-suspenders, not a hot path.
3. **Codes are not secrets and not authorization.** A code is a display/reference label only; every read/mutate is
   independently `org_id`-scoped at the repository layer (ADR-0004). Knowing a code grants nothing.

## Consequences
- Codes match the captured original's shape (`#xxxxxx`) for pixel/behavior fidelity, and don't leak per-tenant order
  counts the way a global sequential id would.
- Generation is pure + RNG-injectable, so its format is unit-testable; uniqueness/retry is proven by the order-creation
  integration test (two orders in one org get distinct codes).
- Trade-off vs. a monotonic per-day counter (`#A-0001`): random tokens are non-ordinal (you can't infer "how many
  orders today" from a code) — acceptable, since the admin/KDS lists already order by `createdAt`. If the client later
  wants human-sequential codes, this is a localized change to `generateOrderCode` + a per-org counter column.
