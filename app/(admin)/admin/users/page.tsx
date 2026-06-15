"use client";

import { useState } from "react";
import {
  Search,
  UserPlus,
  Mail,
  Phone,
  CalendarDays,
  Pencil,
  MessageSquare,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Local mock — 17 Indonesian users matching the recon screenshot
// ---------------------------------------------------------------------------

type TierCode = "Regular" | "PREMIUM" | "CORPORATE" | "PARTNER";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: TierCode;
  joinedAt: string; // ISO
  bookings: number;
  transactions: number;
}

const USERS: AdminUser[] = [
  {
    id: "u1",
    name: "Test User",
    email: "testuserrqtmhm0r@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-12T16:40:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u2",
    name: "Test User",
    email: "testusertwg2lgpn@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-11T13:57:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u3",
    name: "Test User",
    email: "testuser104phtvo@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-06T10:54:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u4",
    name: "Test User",
    email: "testuserzez0ymrp@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-06T10:07:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u5",
    name: "Test User",
    email: "testuserruk04k5m@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-03T22:38:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u6",
    name: "Test User",
    email: "testuser4v0edx78@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-03T22:30:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u7",
    name: "Test User",
    email: "testusero78r93mn@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-03T22:20:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u8",
    name: "Test User",
    email: "testusera2zd3g5f@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-03T22:15:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u9",
    name: "Test User",
    email: "testusertfvnaex0@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-03T22:05:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u10",
    name: "Test User",
    email: "testuser602vits9@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-03T21:54:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u11",
    name: "Test User",
    email: "testuserke0hj5dj@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-03T20:02:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u12",
    name: "Test User",
    email: "testusertsylwd7q@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-05-03T19:49:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u13",
    name: "Jestin",
    email: "jestin088@gmail.com",
    phone: "",
    tier: "Regular",
    joinedAt: "2026-04-01T17:43:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u14",
    name: "Test User",
    email: "testuserxho3imnz@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-03-31T13:08:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u15",
    name: "Test User",
    email: "testusergx616w22@example.com",
    phone: "081234567890",
    tier: "Regular",
    joinedAt: "2026-03-31T12:47:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u16",
    name: "mahestya adhy sanjaya",
    email: "mahestya.a.sanjaya@gmail.com",
    phone: "+6281314004400",
    tier: "Regular",
    joinedAt: "2026-03-21T14:30:00+07:00",
    bookings: 0,
    transactions: 2,
  },
  {
    id: "u17",
    name: "Budi Santoso",
    email: "budi@gmail.com",
    phone: "+62 812 1111 1111",
    tier: "PREMIUM",
    joinedAt: "2026-02-10T12:28:00+07:00",
    bookings: 12,
    transactions: 58,
  },
];

// ---------------------------------------------------------------------------
// Tier helpers
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<TierCode, string> = {
  Regular: "Regular",
  PREMIUM: "Premium",
  CORPORATE: "Corporate",
  PARTNER: "Partner",
};

const TIER_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Semua Membership" },
  { value: "Regular", label: "Regular" },
  { value: "PREMIUM", label: "Premium" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "PARTNER", label: "Partner" },
];

function tierTone(tier: TierCode): "neutral" | "active" | "paid" | "info" {
  if (tier === "Regular") return "neutral";
  if (tier === "PREMIUM") return "active";
  if (tier === "CORPORATE") return "info";
  return "paid";
}

// ---------------------------------------------------------------------------
// Date formatting (matches text: "12 Mei 2026, 16.40")
// ---------------------------------------------------------------------------

const idDateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const idTimeFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function fmtJoin(iso: string): string {
  const d = new Date(iso);
  const datePart = idDateFmt.format(d);
  const timePart = idTimeFmt.format(d).replace(/:/g, ".");
  return `${datePart}, ${timePart}`;
}

// ---------------------------------------------------------------------------
// Avatar initials
// ---------------------------------------------------------------------------

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Uniform teal avatar tint to match the recon
function avatarColor(): string {
  return "bg-teal-100 text-teal-700";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const filtered = USERS.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone.includes(q);
    const matchTier = tierFilter === "all" || u.tier === tierFilter;
    return matchSearch && matchTier;
  });

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Kelola member dan membership
          </p>
        </div>
        <Button variant="primary" size="md" className="shrink-0">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Tambah User
        </Button>
      </div>

      {/* ── Search + tier filter bar ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Cari nama atau email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tier filter — native select wrapped to look like the design */}
        <div className="relative shrink-0">
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm text-slate-950 focus-visible:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30"
          >
            {TIER_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* ── Member list ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Members ({filtered.length})
        </h2>

        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-gray-400 shadow-sm">
              Tidak ada member yang ditemukan.
            </div>
          )}

          {filtered.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserRow
// ---------------------------------------------------------------------------

function UserRow({ user }: { user: AdminUser }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      {/* Avatar */}
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          avatarColor(),
        )}
        aria-hidden="true"
      >
        {initials(user.name)}
      </div>

      {/* Main info */}
      <div className="min-w-0 flex-1">
        {/* Name + tier badge */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 truncate">
            {user.name}
          </span>
          <Badge tone={tierTone(user.tier)}>
            {TIER_LABELS[user.tier]}
          </Badge>
        </div>

        {/* Contact row */}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="flex items-center gap-1 min-w-0">
            <Mail className="h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
            <span className="truncate">{user.email}</span>
          </span>
          {user.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
              {user.phone}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
            Join {fmtJoin(user.joinedAt)}
          </span>
        </div>

        {/* Stats row */}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span
            className={cn(
              user.bookings > 0 ? "text-teal-600 font-medium" : "text-gray-400",
            )}
          >
            {user.bookings} bookings
          </span>
          <span
            className={cn(
              user.transactions > 0
                ? "text-orange-500 font-medium"
                : "text-gray-400",
            )}
          >
            {user.transactions} transactions
          </span>
        </div>
      </div>

      {/* Action buttons — outlined icon chips matching the recon */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={`Edit ${user.name}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-gray-500 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-600"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Kirim pesan ke ${user.name}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-gray-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Hapus ${user.name}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
