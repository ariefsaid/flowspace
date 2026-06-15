import type { AdminStats, Member } from "./types";

/** Admin dashboard KPI tiles (OBS-021/022). */
export const adminStats: AdminStats = {
  todayBookings: 24,
  activeSessions: 6,
  pendingPayments: 3,
  totalUsers: 412,
  todayRevenue: 1840000,
  weeklyRevenue: 12350000,
  monthlyRevenue: 48720000,
};

/** Member directory sample for admin user-management surfaces (OBS-030). */
export const members: Member[] = [
  {
    id: "usr_budi",
    name: "Budi Santoso",
    email: "budi.santoso@example.id",
    tier: "PREMIUM",
    tierLabel: "Tarif standar",
    timeCredits: 139,
    printBalance: 68,
    activeSession: {
      table: "Meja F",
      tarifPerHour: 15000,
      maxHours: 4,
      startedAt: "2026-06-15T16:43:00+07:00",
    },
  },
  {
    id: "usr_sari",
    name: "Sari Wijaya",
    email: "sari.wijaya@example.id",
    tier: "CORPORATE",
    tierLabel: "Diskon 10%",
    timeCredits: 42,
    printBalance: 120,
    activeSession: null,
  },
  {
    id: "usr_andi",
    name: "Andi Pratama",
    email: "andi.pratama@example.id",
    tier: "PREMIUM",
    tierLabel: "Tarif standar",
    timeCredits: 18,
    printBalance: 5,
    activeSession: null,
  },
  {
    id: "usr_maya",
    name: "Maya Lestari",
    email: "maya.lestari@example.id",
    tier: "PARTNER",
    tierLabel: "Diskon 25%",
    timeCredits: 76,
    printBalance: 240,
    activeSession: null,
  },
  {
    id: "usr_rizki",
    name: "Rizki Hidayat",
    email: "rizki.hidayat@example.id",
    tier: "CORPORATE",
    tierLabel: "Diskon 10%",
    timeCredits: 0,
    printBalance: 12,
    activeSession: null,
  },
];
