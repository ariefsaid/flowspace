/**
 * Edge-runtime Supabase client for the middleware (ADR-0014 §3).
 *
 * `@supabase/ssr`'s `createServerClient` is Edge-safe (no Node-only deps). This
 * binds it to the incoming request cookies and an outgoing `NextResponse` so the
 * session can be read — and refreshed cookies propagated — at the edge, before
 * the RSC render. It must NOT import Drizzle / postgres-js / any Node-only module
 * (that would break the Edge bundle — `pnpm build` is the guardrail).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Builds a Supabase server client bound to the request/response cookies, plus the
 * `response` object the middleware must return so refreshed-session cookies are
 * written back. Read the user with `supabase.auth.getUser()`.
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  return { supabase, response: () => response };
}
