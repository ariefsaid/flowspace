import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { getSessionUser } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/route-policy";

/**
 * Server-side ADMIN guard for the whole /admin/* surface (defense-in-depth).
 * `middleware.ts` is the primary gate, but this layout re-asserts authorization
 * at the data-render boundary so the surface stays ADMIN-only even if the
 * middleware matcher is ever narrowed or a render path bypasses the edge.
 * Unauthenticated → /login; authenticated non-admin → their role home.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect(roleHome(user.role));

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
