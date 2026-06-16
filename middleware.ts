/**
 * Server-side route gate (ADR-0004 / ADR-0014 §3) — runs in the Edge runtime.
 *
 * Reads the Supabase session at the edge via `auth.getUser()` (network-validated
 * — the documented safe check at a trust boundary; never trust an unverified
 * cookie here) and applies the SAME decision table as the old NextAuth
 * `authorized` callback, consulting the single source of truth
 * `lib/auth/route-policy.ts` (`requiredRolesFor`, `roleHome`). Because the
 * middleware short-circuits before the RSC render, protected content/data cannot
 * leak pre-redirect (closes OBS-131/OBS-122 → AC-010/AC-011/AC-014).
 *
 * The user's `role` for the gate is read from the Supabase JWT app-metadata claim
 * (set server-side at signup via the admin API), so there is NO DB round-trip at
 * the edge — preserving the ADR-0004 "Edge-fast" property. The authoritative
 * `orgId`/`role` for data access is re-resolved server-side in
 * `lib/auth/session.ts`; the claim is a convenience for the gate only.
 *
 * Edge bundle hygiene: this module and `lib/supabase/middleware.ts` import ONLY
 * `@supabase/ssr` (Edge-safe) + the pure route-policy. If Drizzle/postgres-js (or
 * any Node-only dep) ever leaks in, `pnpm build` fails here — the intended guardrail.
 */
import { type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";
import { requiredRolesFor, roleHome } from "@/lib/auth/route-policy";
import type { Role } from "@/lib/db/enums";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const required = requiredRolesFor(pathname);

  const { supabase, response } = createSupabaseMiddlewareClient(request);

  // Public paths: no session read needed.
  if (required === "public") return response();

  // getUser() is the safe, network-validated check (ADR-0014 §3). It also
  // refreshes the session cookie onto `response` when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user?.app_metadata?.role as Role | undefined;

  if (!role) {
    // Unauthenticated → redirect to login, preserving the target (AC-014).
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }

  if (required.length === 0) return response(); // any authenticated user
  if (required.includes(role)) return response();

  // Authenticated but wrong role → deny and send to the role's home
  // (AC-010/AC-011: never render the protected content).
  return Response.redirect(new URL(roleHome(role), request.nextUrl));
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp)$).*)",
  ],
};
