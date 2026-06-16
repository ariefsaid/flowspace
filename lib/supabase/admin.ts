/**
 * Supabase **admin** client (service-role key) — server-only (ADR-0014 §1).
 *
 * Used by the signup server action and the seed to mint `auth.users` rows and
 * set the `role`/`org_id` app-metadata claims. The service-role key bypasses
 * RLS and must NEVER be imported into a client bundle. `persistSession` is off:
 * this client is request-scoped and stateless.
 */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
