import { startOfDay, subDays } from "date-fns";
import Link from "next/link";
import {
  Calendar,
  Activity,
  Clock,
  Users,
  DollarSign,
  TrendingUp,
  CreditCard,
  Receipt,
} from "lucide-react";
import { StatTile } from "@/components/ui";
import { Badge } from "@/components/ui";
import { Card } from "@/components/ui";
import { requireSession } from "@/lib/auth/session";
import { listBookings, listPendingBookings } from "@/lib/db/bookings";
import { listByOrg } from "@/lib/db/users";
import {
  listRecentTransactions,
  sumRevenueSince,
} from "@/lib/db/transactions";
import { formatRupiah, formatDateID } from "@/lib/format";
import type { TransactionStatus } from "@/lib/db/enums";

function statusTone(status: TransactionStatus): "completed" | "pending" {
  return status === "COMPLETED" ? "completed" : "pending";
}

/**
 * Admin dashboard — server component. All KPIs are computed server-side from
 * org-scoped repository reads (ADR-0004); no client-supplied numbers. The
 * markup is unchanged from the mock-driven version — only the data source
 * swapped from lib/mock/* to the live Drizzle repositories.
 *
 * ponytail: counts reuse the list repositories (.length) instead of dedicated
 * COUNT queries — fine for a single-venue MVP; add COUNT helpers if a dashboard
 * load ever shows up in profiling.
 */
export default async function AdminDashboardPage() {
  const user = await requireSession();
  const orgId = user.orgId;

  // Revenue windows. "Monthly" = trailing 30 days (recon did not pin the exact
  // boundary); documented here so the ceiling is explicit.
  const startOfToday = startOfDay(new Date());
  const weekAgo = subDays(new Date(), 7);
  const monthAgo = subDays(new Date(), 30);

  const [
    todayBookingsRows,
    activeRows,
    pendingRows,
    users,
    todayRevenue,
    weeklyRevenue,
    monthlyRevenue,
    recentTxns,
  ] = await Promise.all([
    listBookings(orgId, { since: startOfToday }),
    listBookings(orgId, { status: "ACTIVE" }),
    listPendingBookings(orgId),
    listByOrg(orgId),
    sumRevenueSince(orgId, startOfToday),
    sumRevenueSince(orgId, weekAgo),
    sumRevenueSince(orgId, monthAgo),
    listRecentTransactions(orgId, 10),
  ]);

  const stats = {
    todayBookings: todayBookingsRows.length,
    activeSessions: activeRows.length,
    pendingPayments: pendingRows.length,
    totalUsers: users.length,
    todayRevenue,
    weeklyRevenue,
    monthlyRevenue,
  };

  // Attach the member display name to each recent ledger row. userId is null for
  // guest cafe orders → "Tamu". A user not in the map (e.g. archived) falls back
  // to "Tamu" too — ponytail: good enough for the recent-activity list.
  const userNames = new Map(users.map((u) => [u.id, u.name]));
  const recentTransactions = recentTxns.map((txn) => ({
    id: txn.id,
    user: (txn.userId && userNames.get(txn.userId)) || "Tamu",
    description: txn.description,
    amount: txn.amountRupiah,
    datetime: txn.createdAt.toISOString(),
    status: txn.status,
  }));

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your coworking space operations
        </p>
      </div>

      {/* Row 1 — 4 KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Today's Bookings"
          value={stats.todayBookings}
          icon={Calendar}
          accent="teal"
        />
        <StatTile
          label="Active Sessions"
          value={stats.activeSessions}
          icon={Activity}
          accent="green"
        />
        <Link href="/admin/pending" className="hover:opacity-90 transition-opacity">
          <StatTile
            label="Pending Payments"
            value={stats.pendingPayments}
            icon={Clock}
            accent="orange"
          />
        </Link>
        <StatTile
          label="Total Users"
          value={stats.totalUsers}
          icon={Users}
          accent="blue"
        />
      </div>

      {/* Row 2 — 3 revenue tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Today's Revenue — teal */}
        <div className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-teal-800 to-teal-900 p-4 shadow-md text-white">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Today&apos;s Revenue</p>
            <p className="mt-1 truncate text-2xl font-bold">
              {formatRupiah(stats.todayRevenue)}
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <DollarSign className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
        </div>

        {/* Weekly Revenue — orange (darkened to from-orange-600/to-orange-700 for WCAG-AA contrast) */}
        <div className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-orange-600 to-orange-700 p-4 shadow-md text-white">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Weekly Revenue</p>
            <p className="mt-1 truncate text-2xl font-bold">
              {formatRupiah(stats.weeklyRevenue)}
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <TrendingUp className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
        </div>

        {/* Monthly Revenue — purple */}
        <div className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-4 shadow-md text-white">
          <div className="min-w-0">
            <p className="text-sm font-medium text-purple-100">Monthly Revenue</p>
            <p className="mt-1 truncate text-2xl font-bold">
              {formatRupiah(stats.monthlyRevenue)}
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <CreditCard className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800">
          <Receipt className="h-5 w-5 text-teal-600" aria-hidden="true" />
          Recent Transactions
        </h2>
        {recentTransactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Belum ada transaksi terbaru.
          </p>
        ) : (
          <div className="divide-y divide-slate-200">
            {recentTransactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{txn.user}</p>
                  <p className="mt-0.5 text-xs text-gray-500 truncate">
                    {txn.description}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {formatDateID(txn.datetime)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatRupiah(txn.amount)}
                  </span>
                  <Badge tone={statusTone(txn.status)}>{txn.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
