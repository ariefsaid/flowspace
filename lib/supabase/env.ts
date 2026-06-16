/**
 * Resolves the Supabase connection params from env, with the well-known
 * **local-stack** demo values as the only fallback (ADR-0013, I-005 Phase 3).
 *
 * The local anon/service-role keys printed by `supabase status` are fixed,
 * non-secret demo JWTs (`iss: supabase-demo`) — identical on every local stack —
 * so defaulting to them keeps dev/CI working without a committed `.env`, while
 * production MUST supply the real values via env (never committed; see
 * `docs/environments.md`). The service-role key is server-only and must never
 * be exposed to a `NEXT_PUBLIC_*` surface.
 */

/** Local Supabase CLI defaults (non-secret demo values; see `supabase status`). */
const LOCAL_URL = "http://127.0.0.1:64321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_URL;

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY;

/** Server-only. Reading this from a client bundle is a misuse — keep it server-side. */
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE_KEY;
