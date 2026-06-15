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
import { adminStats } from "@/lib/mock/admin";
import { recentTransactions } from "@/lib/mock/transactions";
import { formatRupiah, formatDateID } from "@/lib/format";
import type { TransactionStatus } from "@/lib/mock/types";

function statusTone(status: TransactionStatus): "completed" | "pending" {
  return status === "COMPLETED" ? "completed" : "pending";
}

export default function AdminDashboardPage() {
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
          value={adminStats.todayBookings}
          icon={Calendar}
          accent="teal"
        />
        <StatTile
          label="Active Sessions"
          value={adminStats.activeSessions}
          icon={Activity}
          accent="green"
        />
        <StatTile
          label="Pending Payments"
          value={adminStats.pendingPayments}
          icon={Clock}
          accent="orange"
        />
        <StatTile
          label="Total Users"
          value={adminStats.totalUsers}
          icon={Users}
          accent="blue"
        />
      </div>

      {/* Row 2 — 3 revenue tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Today's Revenue — teal */}
        <div className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 p-4 shadow-md text-white">
          <div className="min-w-0">
            <p className="text-sm font-medium text-teal-100">Today&apos;s Revenue</p>
            <p className="mt-1 truncate text-2xl font-bold">
              {formatRupiah(adminStats.todayRevenue)}
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <DollarSign className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
        </div>

        {/* Weekly Revenue — orange */}
        <div className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 p-4 shadow-md text-white">
          <div className="min-w-0">
            <p className="text-sm font-medium text-orange-100">Weekly Revenue</p>
            <p className="mt-1 truncate text-2xl font-bold">
              {formatRupiah(adminStats.weeklyRevenue)}
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
              {formatRupiah(adminStats.monthlyRevenue)}
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
      </Card>
    </div>
  );
}
