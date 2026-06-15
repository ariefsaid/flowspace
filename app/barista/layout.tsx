import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui";

export const metadata = {
  title: "Dashboard Barista",
};

export default function BaristaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Minimal sticky glass header — no shared nav, barista-only chrome */}
      <header className="sticky top-0 z-30 h-[65px] backdrop-blur-md bg-white/80 border-b border-slate-200 flex items-center px-6">
        <BrandMark />
      </header>
      {children}
    </div>
  );
}
