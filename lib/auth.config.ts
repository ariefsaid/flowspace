/**
 * Edge-safe NextAuth (Auth.js v5) base config (ADR-0003 §6).
 *
 * This module runs inside the Edge middleware bundle, so it MUST NOT import
 * Prisma or bcrypt (or anything that transitively pulls a native/Node-only
 * dependency). It carries only the callbacks, the sign-in page, and the
 * `authorized` route gate. The Credentials provider (which needs Prisma +
 * bcrypt) is added separately in `lib/auth.ts`, which runs in the Node runtime.
 */
import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";
import { requiredRolesFor, roleHome } from "@/lib/auth/route-policy";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // The Credentials provider is added in lib/auth.ts (Node runtime).
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id ?? token.sub;
        token.role = user.role;
        token.orgId = user.orgId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.orgId = token.orgId as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const required = requiredRolesFor(request.nextUrl.pathname);
      if (required === "public") return true;
      const role = auth?.user?.role as Role | undefined;
      if (!role) return false; // unauthenticated → NextAuth redirects to signIn
      if (required.length === 0) return true; // any authenticated user
      if (required.includes(role)) return true;
      // Authenticated but wrong role → deny and send to the role's home.
      return Response.redirect(new URL(roleHome(role), request.nextUrl));
    },
  },
};
