/**
 * Mock-data domain types (frontend-first; no DB).
 *
 * These mirror the recon observations (OBS-*) and are the shapes page builders
 * consume from `@/lib/mock/*`. They are intentionally lightweight and UI-facing.
 */

// ---------------------------------------------------------------------------
// Status enums / unions
// ---------------------------------------------------------------------------

export type BookingStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

/** Payment state machine for bookings (OBS-111). */
export type PaymentStatus = "WAITING_CASHIER" | "PAID_CASHIER" | "PAID_ONLINE";

/** Transaction lifecycle (OBS-023). */
export type TransactionStatus = "COMPLETED" | "PENDING";

export type TransactionKind = "print" | "booking" | "cafe" | "package";

/** Cafe order lifecycle on the barista KDS (OBS-121). */
export type OrderStatus = "new" | "preparing" | "ready";

/** Print job lifecycle (OBS-083). */
export type PrintJobStatus = "WAITING" | "READY";

export type MenuCategory = "Coffee" | "Food" | "Non-Coffee" | "Snack";

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

export interface ActiveSession {
  /** Facility label, e.g. "Meja F". */
  table: string;
  /** Hourly rate in Rupiah, e.g. 15000. */
  tarifPerHour: number;
  /** Max billable hours (rounding cap), e.g. 4. */
  maxHours: number;
  /** ISO timestamp when the walk-in session started. */
  startedAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  /** Membership tier code, e.g. "PREMIUM". */
  tier: string;
  /** Human label for the tier's discount posture, e.g. "Tarif standar". */
  tierLabel: string;
  /** Remaining time credit in hours (OBS-056). */
  timeCredits: number;
  /** Remaining print balance in pages/sheets (OBS-056). */
  printBalance: number;
  /** Live walk-in session, if any (OBS-051). */
  activeSession: ActiveSession | null;
}

// ---------------------------------------------------------------------------
// Cafe
// ---------------------------------------------------------------------------

export interface MenuItem {
  id: string;
  name: string;
  emoji: string;
  category: MenuCategory;
  /** Base price in Rupiah. */
  price: number;
  description: string;
  /** Drinks with hot/cold + sugar options have variants (OBS-072). */
  hasVariants: boolean;
}

export interface LastOrderLine {
  name: string;
  qty: number;
  /** Optional variant detail, e.g. "Cold, Less Sugar". */
  variant?: string;
}

export interface LastOrder {
  id: string;
  status: "Selesai";
  /** ISO timestamp. */
  date: string;
  lines: LastOrderLine[];
  total: number;
}

// ---------------------------------------------------------------------------
// Time-credit packages
// ---------------------------------------------------------------------------

export interface CreditPackage {
  id: string;
  hours: number;
  price: number;
  /** Effective hourly rate (price / hours). */
  pricePerHour: number;
  /** Highlighted "Popular" tier (OBS-101). */
  popular?: boolean;
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export interface Booking {
  id: string;
  /** Facility label: Meja A–I, Meeting Room A, Coworking Seat N, Full room. */
  facility: string;
  /** ISO start timestamp. */
  start: string;
  /** ISO end timestamp. */
  end: string;
  /** Duration in hours. */
  durationHours: number;
  status: BookingStatus;
  payment: PaymentStatus;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface Transaction {
  id: string;
  /** Member display name (admin view, OBS-023). */
  user: string;
  kind: TransactionKind;
  /** Human-readable description line. */
  description: string;
  amount: number;
  /** ISO timestamp. */
  datetime: string;
  status: TransactionStatus;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminStats {
  todayBookings: number;
  activeSessions: number;
  pendingPayments: number;
  totalUsers: number;
  todayRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
}

// ---------------------------------------------------------------------------
// Barista KDS
// ---------------------------------------------------------------------------

export interface BaristaOrderLine {
  name: string;
  qty: number;
  variant?: string;
}

export interface BaristaOrder {
  id: string;
  /** Short order code shown on the ticket, e.g. "#A23". */
  code: string;
  /** Customer / member name or "Guest". */
  customer: string;
  status: OrderStatus;
  /** ISO timestamp the order was placed. */
  placedAt: string;
  lines: BaristaOrderLine[];
}

// ---------------------------------------------------------------------------
// Print + WiFi
// ---------------------------------------------------------------------------

export interface PrintJob {
  id: string;
  filename: string;
  pages: number;
  price: number;
  status: PrintJobStatus;
  /** ISO timestamp. */
  datetime: string;
}

export interface WifiInfo {
  ssid: string;
  voucher: string;
}
