"use client";

import {
  Users,
  Building2,
  Coffee,
  Printer,
  Server,
  Globe,
  BarChart3,
  Mail,
  Wifi,
  ChevronRight,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

interface SettingCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  iconColor: string;
  /** When set, the card navigates here (a built surface); otherwise it is inert. */
  href?: string;
}

const settingCards: SettingCard[] = [
  {
    icon: <Users className="h-8 w-8" />,
    title: "Kategori Membership",
    description: "Kelola tier membership dan diskon per kategori",
    iconColor: "text-teal-500",
    href: "/admin/settings/tiers",
  },
  {
    icon: <Building2 className="h-8 w-8" />,
    title: "Fasilitas",
    description: "Kelola Coworking Seat dan Meeting Room",
    iconColor: "text-blue-500",
  },
  {
    icon: <Coffee className="h-8 w-8" />,
    title: "Menu Cafe",
    description: "Kelola item menu makanan dan minuman",
    iconColor: "text-orange-500",
  },
  {
    icon: <Printer className="h-8 w-8" />,
    title: "Harga Print & Fotocopy",
    description: "Kelola harga print dan fotocopy",
    iconColor: "text-purple-500",
  },
  {
    icon: <Printer className="h-8 w-8" />,
    title: "Daftar Printer",
    description: "Kelola printer yang tersedia",
    iconColor: "text-blue-600",
  },
  {
    icon: <Server className="h-8 w-8" />,
    title: "Print Server (Mini PC)",
    description: "Konfigurasi koneksi print server lokal",
    iconColor: "text-slate-600",
  },
  {
    icon: <Globe className="h-8 w-8" />,
    title: "Site Settings",
    description: "Info, SEO, Theme, Logo, dan Social Media",
    iconColor: "text-green-600",
  },
  {
    icon: <BarChart3 className="h-8 w-8" />,
    title: "Google Analytics",
    description: "Konfigurasi tracking dan analytics",
    iconColor: "text-yellow-600",
  },
  {
    icon: <Mail className="h-8 w-8" />,
    title: "Email Settings",
    description: "Konfigurasi notifikasi email otomatis",
    iconColor: "text-red-500",
  },
  {
    icon: <Wifi className="h-8 w-8" />,
    title: "UniFi Controller",
    description: "Konfigurasi WiFi voucher otomatis",
    iconColor: "text-teal-500",
  },
];

export default function AdminSettingsPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="h-8 w-8 text-teal-500" />
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        </div>
        <p className="text-gray-500 text-sm">
          Kelola semua pengaturan aplikasi FlowSpace
        </p>
      </div>

      {/* Settings grid — 3 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {settingCards.map((card) => {
          const cardClass = cn(
            "group flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm p-6",
            "text-left transition-all hover:shadow-md hover:border-slate-300",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
          );
          const inner = (
            <>
              {/* Top row: icon + chevron */}
              <div className="flex items-start justify-between">
                <div className={cn("flex-shrink-0", card.iconColor)}>
                  {card.icon}
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
              </div>

              {/* Text */}
              <div className="mt-4">
                <p className="text-base font-bold text-gray-900 leading-snug">
                  {card.title}
                </p>
                <p className="text-sm text-gray-500 mt-1 leading-snug">
                  {card.description}
                </p>
              </div>
            </>
          );

          return card.href ? (
            <Link key={card.title} href={card.href} className={cardClass}>
              {inner}
            </Link>
          ) : (
            <button key={card.title} type="button" className={cardClass}>
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
