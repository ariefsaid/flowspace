import type { ReactNode } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
