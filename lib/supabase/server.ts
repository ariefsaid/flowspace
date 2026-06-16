/**
 * Supabase server client (`@supabase/ssr`) for RSC / route-handler / server-action
 * session reads (ADR-0014 §2). Bound to the Next.js request cookies via
 * `next/headers`. Node runtime — NOT for the Edge middleware (that uses
 * `lib/supabase/middleware.ts`, which bridges request/response cookies).
 */
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // In RSC reads the cookie store is immutable; the `try` keeps those
        // call-sites working (the session is refreshed by the middleware, which
        // owns the writable response). In route handlers / actions the set
        // succeeds normally.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // RSC read context — safe to ignore (see comment above).
        }
      },
    },
  });
}
