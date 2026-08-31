"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  UserPlus,
  Users,
  Mail,
  Phone,
  CalendarDays,
  Pencil,
  Archive,
  Wallet,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import type { MembershipTier, Role } from "@/lib/db/enums";
import { updateUserAction, archiveUserAction, adjustCreditsAction, resetUserPasswordAction } from "./actions";
import { UserFormDialog, TIER_LABELS, type UserFormValues } from "./UserFormDialog";
import { CreditAdjustDialog, type CreditAdjustValues } from "./CreditAdjustDialog";
import { userErrorMessage } from "./userErrors";

// ---------------------------------------------------------------------------
// View shape — maps DB AppUser to what this component consumes.
// ponytail: phone/bookings/transactions are not on app_users; phone renders as
// "" (omitted by the existing conditional), the two counts render as 0 until
// per-user aggregate reads are a separate concern. Add User stays a
// non-wired stub — signup owns member creation (I-047 scope).
// ---------------------------------------------------------------------------

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  /** Not on app_users today — empty string keeps the conditional UI intact. */
  phone: string;
  role: Role;
  tier: MembershipTier;
  joinedAt: string; // ISO
  bookings: number;
  transactions: number;
  timeCredits: number;
  printBalance: number;
}

// ---------------------------------------------------------------------------
// Tier helpers (DB enum domain: REGULAR / PREMIUM / GOLD)
// ---------------------------------------------------------------------------

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

export function UsersClient({ users: initialUsers }: UsersClientProps) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const [editingUser, setEditingUser] = useState<AdminUserView | null>(null);
  const [adjustingUser, setAdjustingUser] = useState<AdminUserView | null>(null);
  const [archivingUser, setArchivingUser] = useState<AdminUserView | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

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

  async function handleEditSave(values: UserFormValues) {
    if (!editingUser) return;
    const updated = await updateUserAction(editingUser.id, {
      name: values.name,
      role: values.role,
      membershipTier: values.membershipTier,
    });
    if (values.password.trim()) {
      await resetUserPasswordAction(editingUser.id, values.password.trim());
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === editingUser.id
          ? { ...u, name: updated.name, role: updated.role, tier: updated.membershipTier }
          : u,
      ),
    );
    setEditingUser(null);
    router.refresh();
  }

  async function handleAdjustCredits(values: CreditAdjustValues) {
    if (!adjustingUser) return;
    const result = await adjustCreditsAction(adjustingUser.id, values);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === adjustingUser.id
          ? { ...u, timeCredits: result.timeCredits, printBalance: result.printBalance }
          : u,
      ),
    );
    setAdjustingUser(null);
    router.refresh();
  }

  async function handleConfirmArchive() {
    if (!archivingUser) return;
    setArchivePending(true);
    setArchiveError(null);
    try {
      await archiveUserAction(archivingUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== archivingUser.id));
      setArchivingUser(null);
      router.refresh();
    } catch (e) {
      setArchiveError(userErrorMessage(e));
    } finally {
      setArchivePending(false);
    }
  }

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
        {/* ponytail: Add User stays a non-wired stub — signup owns member creation. */}
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
            <UserRow
              key={user.id}
              user={user}
              onEdit={() => setEditingUser(user)}
              onAdjustCredits={() => setAdjustingUser(user)}
              onArchive={() => {
                setArchiveError(null);
                setArchivingUser(user);
              }}
            />
          ))}
        </div>
      </section>

      {editingUser && (
        <UserFormDialog user={editingUser} onCancel={() => setEditingUser(null)} onSave={handleEditSave} />
      )}

      {adjustingUser && (
        <CreditAdjustDialog
          user={adjustingUser}
          onCancel={() => setAdjustingUser(null)}
          onSave={handleAdjustCredits}
        />
      )}

      {archivingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="archive-confirm-title"
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-md"
          >
            <h2 id="archive-confirm-title" className="text-lg font-semibold text-gray-900">
              Arsipkan user?
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              &quot;{archivingUser.name}&quot; tidak akan muncul lagi di direktori. Riwayat booking &amp; transaksi
              tetap tersimpan.
            </p>
            {archiveError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {archiveError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setArchivingUser(null)} disabled={archivePending}>
                Batal
              </Button>
              <Button variant="danger" onClick={handleConfirmArchive} disabled={archivePending}>
                {archivePending ? "Mengarsipkan…" : "Arsipkan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserRow
// ---------------------------------------------------------------------------

function UserRow({
  user,
  onEdit,
  onAdjustCredits,
  onArchive,
}: {
  user: AdminUserView;
  onEdit: () => void;
  onAdjustCredits: () => void;
  onArchive: () => void;
}) {
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

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${user.name}`}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-teal-600 text-teal-600 text-sm font-medium hover:bg-teal-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          onClick={onAdjustCredits}
          aria-label={`Sesuaikan saldo ${user.name}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-gray-500 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onArchive}
          aria-label={`Arsipkan ${user.name}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
        >
          <Archive className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
