import type { ReactNode } from "react";
import { MemberHeader } from "@/components/layout";

export const metadata = {
  title: "Dashboard Barista",
};

export default function BaristaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Shared member nav chrome — barista uses the full top navigation */}
      <MemberHeader />
      {children}
    </div>
  );
}
