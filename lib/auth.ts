/**
 * Full NextAuth (Auth.js v5) config — Node runtime (ADR-0003).
 *
 * Spreads the Edge-safe base (`lib/auth.config.ts`) and adds the Credentials
 * provider, whose `authorize` (in `lib/auth/authorize.ts`) imports Prisma (via
 * the `lib/db/users` seam) and bcrypt. This module must never be imported by
 * the Edge middleware — the middleware imports `lib/auth.config.ts` only,
 * keeping Prisma/bcrypt out of the Edge bundle.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { authorizeUser } from "@/lib/auth/authorize";

// L1 secret hygiene: resolve a single canonical secret, preferring AUTH_SECRET
// (Auth.js v5) and falling back to NEXTAUTH_SECRET (used by CI). In production,
// refuse to boot without a real secret.
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const PLACEHOLDER_SECRETS = new Set([
  "",
  "changeme",
  "secret",
  "your-secret-here",
  "generate-a-long-random-string",
]);
if (
  process.env.NODE_ENV === "production" &&
  (!authSecret || PLACEHOLDER_SECRETS.has(authSecret))
) {
  throw new Error(
    "AUTH_SECRET is missing or set to a placeholder in production. " +
      "Generate a long random string (e.g. `openssl rand -base64 32`).",
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: authSecret,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (creds) => authorizeUser(creds),
    }),
  ],
});
