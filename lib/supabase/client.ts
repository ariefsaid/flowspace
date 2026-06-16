/**
 * Supabase **browser** client (`@supabase/ssr`) for client components
 * (login/signup `signInWithPassword`, header `signOut`). Anon key only —
 * never the service-role key (ADR-0014). Safe to import in `"use client"` code.
 */
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
