"use client";

import { useState } from "react";
import {
  Search,
  UserPlus,
  Users,
  Mail,
  Phone,
  CalendarDays,
  Pencil,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import type { MembershipTier } from "@/lib/db/enums";

// ---------------------------------------------------------------------------
// View shape — maps DB AppUser to what this component consumes.
// ponytail: phone/bookings/transactions are not on app_users; phone renders as
// "" (omitted by the existing conditional), the two counts render as 0 until
// per-user aggregate reads are a separate concern. Edit/Add stay non-wired
// stubs (markup preserved, no action) — ponytail, deferred to a later issue.
// ---------------------------------------------------------------------------

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  /** Not on app_users today — empty string keeps the conditional UI intact. */
  phone: string;
  tier: MembershipTier;
  joinedAt: string; // ISO
  bookings: number;
  transactions: number;
}

// ---------------------------------------------------------------------------
// Tier helpers (DB enum domain: REGULAR / PREMIUM / GOLD)
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<MembershipTier, string> = {
  REGULAR: "Regular",
  PREMIUM: "Premium",
  GOLD: "Gold",
};

const TIER_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Semua Membership" },
  { value: "REGULAR", label: "Regular" },
  { value: "PREMIUM", label: "Premium" },
  { value: "GOLD", label: "Gold" },
];

function tierTone(tier: MembershipTier): "neutral" | "active" | "paid" {
  if (tier === "REGULAR") return "neutral";
  if (tier === "PREMIUM") return "active";
  return "paid"; // GOLD
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
// Page
// ---------------------------------------------------------------------------

export interface UsersClientProps {
  users: AdminUserView[];
}

export function UsersClient({ users }: UsersClientProps) {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const filtered = users.filter((u) => {
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
        {/* ponytail: Add User stays a non-wired stub (no createMember action yet). */}
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
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <Users className="h-4 w-4" aria-hidden="true" />
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

function UserRow({ user }: { user: AdminUserView }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
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
          <span className="font-medium text-teal-600">
            {user.bookings} bookings
          </span>
          <span className="font-medium text-orange-500">
            {user.transactions} transactions
          </span>
        </div>
      </div>

      {/* Action buttons — Edit outlined pill + trash icon-only.
          ponytail: Edit/Delete stay non-wired stubs (no update/archive action yet). */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={`Edit ${user.name}`}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-teal-600 text-teal-600 text-sm font-medium hover:bg-teal-50 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          aria-label={`Hapus ${user.name}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
