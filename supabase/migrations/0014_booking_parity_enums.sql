-- I-040 booking parity overhaul (spec 0007) — enum value additions only.
--
-- Split into its own migration/transaction because Postgres forbids using a
-- value just added via `ALTER TYPE ... ADD VALUE` later in the SAME
-- transaction ("unsafe use of new value"). The next migration (0015) sets
-- `bookings.status DEFAULT 'PENDING'` and the seed migration (0016) inserts
-- `facilities.type = 'FULL_ROOM'` rows — both need these values committed.
--
-- BookingStatus gains PENDING (the new lifecycle's initial state, OBS-813)
-- and CONFIRMED (the paid/awaiting-start state); PENDING did not previously
-- exist on this enum (BookingPaymentStatus has its own distinct PENDING,
-- unrelated). FacilityType gains FULL_ROOM (the event-room catalog type).

ALTER TYPE "public"."BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "public"."BookingStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "public"."FacilityType" ADD VALUE IF NOT EXISTS 'FULL_ROOM';
