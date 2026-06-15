import type { Booking } from "./types";

/**
 * Booking history (OBS-057/110/111). Facilities span Meja A–I, Meeting Room A,
 * Coworking Seat N, Full room. Mix of statuses + payment states.
 */
export const bookings: Booking[] = [
  {
    id: "bk_201",
    facility: "Meja F",
    start: "2026-06-15T16:43:00+07:00",
    end: "2026-06-15T20:43:00+07:00",
    durationHours: 4,
    status: "ACTIVE",
    payment: "WAITING_CASHIER",
  },
  {
    id: "bk_198",
    facility: "Meja A",
    start: "2026-06-10T16:44:00+07:00",
    end: "2026-06-10T18:44:00+07:00",
    durationHours: 2,
    status: "COMPLETED",
    payment: "PAID_CASHIER",
  },
  {
    id: "bk_195",
    facility: "Meeting Room A",
    start: "2026-04-30T13:25:00+07:00",
    end: "2026-04-30T15:25:00+07:00",
    durationHours: 2,
    status: "COMPLETED",
    payment: "PAID_ONLINE",
  },
  {
    id: "bk_190",
    facility: "Meja B",
    start: "2026-04-08T15:10:00+07:00",
    end: "2026-04-08T18:10:00+07:00",
    durationHours: 3,
    status: "COMPLETED",
    payment: "PAID_CASHIER",
  },
  {
    id: "bk_186",
    facility: "Coworking Seat 12",
    start: "2026-04-02T09:00:00+07:00",
    end: "2026-04-02T12:00:00+07:00",
    durationHours: 3,
    status: "COMPLETED",
    payment: "PAID_ONLINE",
  },
  {
    id: "bk_181",
    facility: "Meja I",
    start: "2026-03-20T10:30:00+07:00",
    end: "2026-03-20T11:30:00+07:00",
    durationHours: 1,
    status: "CANCELLED",
    payment: "WAITING_CASHIER",
  },
  {
    id: "bk_174",
    facility: "Full room",
    start: "2026-03-05T18:00:00+07:00",
    end: "2026-03-05T22:00:00+07:00",
    durationHours: 4,
    status: "COMPLETED",
    payment: "PAID_ONLINE",
  },
];
