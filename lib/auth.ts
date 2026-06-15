/**
 * Full NextAuth (Auth.js v5) config — Node runtime (ADR-0003).
 *
 * Spreads the Edge-safe base (`lib/auth.config.ts`) and adds the Credentials
 * provider, whose `authorize` imports Prisma (via the `lib/db/users` seam) and
 * bcrypt. This module must never be imported by the Edge middleware — the
 * middleware imports `lib/auth.config.ts` only, keeping Prisma/bcrypt out of
 * the Edge bundle.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/lib/auth.config";
import { findByEmail } from "@/lib/db/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        const user = await findByEmail(email);
        if (!user || user.archivedAt) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgId,
        };
      },
    }),
  ],
});
