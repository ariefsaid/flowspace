import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { MemberHeader } from "@/components/layout";
import { getSessionUser } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/route-policy";

export const metadata = {
  title: "Dashboard Barista",
};

/**
 * Server-side guard for the /barista KDS surface (defense-in-depth, parity with
 * the (admin) layout guard). middleware.ts is the primary gate; this re-asserts
 * BARISTA|ADMIN at the render boundary so the order queue stays role-gated even
 * if the matcher is narrowed. Unauthenticated → /login; other roles → role home.
 */
export default async function BaristaLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "BARISTA" && user.role !== "ADMIN") redirect(roleHome(user.role));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Shared member nav chrome — barista uses the full top navigation */}
      <MemberHeader />
      {children}
    </div>
  );
}
