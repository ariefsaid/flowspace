"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Clock,
  ShoppingCart,
  ClipboardList,
  Printer,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { brand } from "@/brand.config";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Pengguna", icon: Users },
  { href: "/admin/bookings", label: "Booking", icon: CalendarDays },
  { href: "/admin/pending", label: "Menunggu", icon: Clock },
  { href: "/admin/pos", label: "POS", icon: ShoppingCart },
  { href: "/admin/orders", label: "Pesanan", icon: ClipboardList },
  { href: "/admin/print-reports", label: "Print", icon: Printer },
  { href: "/admin/settings", label: "Pengaturan", icon: Settings },
];

export function AdminHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();

  function handleSignOut() {
    void signOut({ callbackUrl: "/login" });
  }

  return (
    <header className="sticky top-0 z-50 h-[65px] border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-full items-center justify-between gap-4 px-4">
        <Link href="/admin" aria-label="Admin Dashboard">
          <BrandMark />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map(({ href, label, icon: Icon }) => {
            // Exact match for /admin; prefix match for sub-routes.
            const active =
              href === "/admin"
                ? pathname === "/admin"
                : pathname === href || pathname.startsWith(`${href}/`);
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
            {session?.user?.name ?? `Admin ${brand.name}`}
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

export default AdminHeader;
