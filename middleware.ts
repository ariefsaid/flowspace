/**
 * Server-side route gate (ADR-0004) — runs in the Edge runtime.
 *
 * Imports ONLY `lib/auth.config.ts` (Edge-safe: no Prisma, no bcrypt). All role
 * logic lives in the `authorized` callback there, which consults the single
 * source of truth `lib/auth/route-policy.ts`. Because the middleware
 * short-circuits before the RSC render, protected content/data cannot leak
 * pre-redirect (closes OBS-131/OBS-122).
 *
 * If a Prisma/bcrypt import ever leaks into this Edge bundle, `pnpm build`
 * fails here — that is the intended guardrail.
 */
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // Authorization is handled by authConfig.callbacks.authorized
  // (the route-policy table). No per-request logic needed here.
  void req;
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp)$).*)",
  ],
};
