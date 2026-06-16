"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/providers/SessionProvider";
import {
  LayoutDashboard,
  CalendarDays,
  Coffee,
  Printer,
  KeyRound,
  Wallet,
  History,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/booking", label: "Booking", icon: CalendarDays },
  { href: "/cafe", label: "Cafe", icon: Coffee },
  { href: "/print", label: "Print", icon: Printer },
  { href: "/keycard", label: "Kartu Akses", icon: KeyRound },
  { href: "/topup", label: "Top Up", icon: Wallet },
  { href: "/history", label: "Riwayat", icon: History },
];

export function MemberHeader() {
  const pathname = usePathname();
  const { name, signOut } = useSession();

  function handleSignOut() {
    void signOut();
  }

  return (
    <header className="sticky top-0 z-50 h-[65px] border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-full items-center justify-between gap-4 px-4">
        <Link href="/dashboard" aria-label="Dashboard">
          <BrandMark />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-teal-50 text-teal-600"
                    : "text-gray-600 hover:bg-slate-100 hover:text-gray-900",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-medium text-gray-700 sm:inline">
            {name ?? ""}
          </span>
          <Button variant="danger" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Keluar
          </Button>
        </div>
      </div>
    </header>
  );
}

export default MemberHeader;
