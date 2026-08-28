/**
 * Facility + time-credit-package catalog (I-040, spec 0007). Single source
 * of truth consumed by both the idempotent seed paths — the Supabase
 * migration (supabase/migrations/0016_booking_seed.sql, hand-mirrored) and
 * scripts/seed-supabase.ts (the actual dev/CI seeding path; `supabase db
 * reset` alone has no organizations to seed into) — and directly by
 * lib/db/facilities-seed.int.test.ts (AC-800), so the exact catalog values
 * can never drift between the two consumers and the test that proves them.
 *
 * OBS-800..803: 12 desks A–L (Rp25.000/h, cap 4h, zone DESK), 8 counters 1–8
 * (Rp20.000/h, cap 4h, zone COUNTER), Meeting Room A (cap 10, Rp150.000/h)
 * and B (cap 8, Rp120.000/h, zone MEETING), and a capacity-20 full-room
 * event facility (Rp350.000/h, zone FULL_ROOM) — 23 rows total.
 * OBS-826: the four standard time-credit packages.
 */
import type { FacilityType } from "@/lib/db/enums";

export type FacilityCatalogItem = {
  /** Deterministic-id suffix: `${orgId}__fac-${slug}`. */
  slug: string;
  name: string;
  type: FacilityType;
  ratePerHourRupiah: number;
  capacity: number;
  seatLabel: string | null;
  zone: string;
  maxHoursCap: number | null;
};

const DESK_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
const COUNTER_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const FACILITY_CATALOG: readonly FacilityCatalogItem[] = [
  ...DESK_LETTERS.map(
    (letter): FacilityCatalogItem => ({
      slug: `meja-${letter.toLowerCase()}`,
      name: `Meja ${letter}`,
      type: "COWORKING_SEAT",
      ratePerHourRupiah: 25_000,
      capacity: 1,
      seatLabel: letter,
      zone: "DESK",
      maxHoursCap: 4,
    }),
  ),
  ...COUNTER_NUMBERS.map(
    (n): FacilityCatalogItem => ({
      slug: `counter-${n}`,
      name: `Counter ${n}`,
      type: "COWORKING_SEAT",
      ratePerHourRupiah: 20_000,
      capacity: 1,
      seatLabel: String(n),
      zone: "COUNTER",
      maxHoursCap: 4,
    }),
  ),
  {
    slug: "meeting-room-a",
    name: "Meeting Room A",
    type: "MEETING_ROOM",
    ratePerHourRupiah: 150_000,
    capacity: 10,
    seatLabel: null,
    zone: "MEETING",
    maxHoursCap: null,
  },
  {
    slug: "meeting-room-b",
    name: "Meeting Room B",
    type: "MEETING_ROOM",
    ratePerHourRupiah: 120_000,
    capacity: 8,
    seatLabel: null,
    zone: "MEETING",
    maxHoursCap: null,
  },
  {
    slug: "full-room-event",
    name: "Full Room Event",
    type: "FULL_ROOM",
    ratePerHourRupiah: 350_000,
    capacity: 20,
    seatLabel: null,
    zone: "FULL_ROOM",
    maxHoursCap: null,
  },
];

export type PackageCatalogItem = {
  /** Deterministic-id suffix: `${orgId}__pkg-${slug}`. */
  slug: string;
  name: string;
  hours: number;
  priceRupiah: number;
  pricePerHourRupiah: number;
  popular: boolean;
  sortOrder: number;
};

/**
 * Walk-in flat hourly rates (server-authoritative — never client-supplied).
 * Walk-ins have no facility row (facility_id stays null; a member has not
 * chosen a specific seat yet), so their rate cannot be read off a `facilities`
 * row the way scheduled bookings' can — this is the single source of truth
 * `createBooking` reads for `WALKIN_COWORKING`/`WALKIN_MEETING`.
 */
export const WALKIN_RATES: Record<"WALKIN_COWORKING" | "WALKIN_MEETING", number> = {
  WALKIN_COWORKING: 15_000,
  WALKIN_MEETING: 120_000,
};

export const PACKAGE_CATALOG: readonly PackageCatalogItem[] = [
  { slug: "5h", name: "5 Hours", hours: 5, priceRupiah: 75_000, pricePerHourRupiah: 15_000, popular: false, sortOrder: 1 },
  { slug: "10h", name: "10 Hours", hours: 10, priceRupiah: 140_000, pricePerHourRupiah: 14_000, popular: true, sortOrder: 2 },
  { slug: "20h", name: "20 Hours", hours: 20, priceRupiah: 260_000, pricePerHourRupiah: 13_000, popular: false, sortOrder: 3 },
  { slug: "50h", name: "50 Hours", hours: 50, priceRupiah: 600_000, pricePerHourRupiah: 12_000, popular: false, sortOrder: 4 },
];
