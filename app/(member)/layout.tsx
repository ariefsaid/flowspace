import type { ReactNode } from "react";
import { MemberHeader } from "@/components/layout/MemberHeader";

export default function MemberLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <MemberHeader />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
