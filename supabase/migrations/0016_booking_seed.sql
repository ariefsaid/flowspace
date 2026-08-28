-- I-040 booking parity (spec 0007) — idempotent facility + package catalog
-- seed. Mirrors lib/booking/catalog.ts exactly (hand-kept in lockstep; the
-- TS module is the single source of truth consumed by
-- scripts/seed-supabase.ts and lib/db/facilities-seed.int.test.ts).
--
-- Follows the 0013_print_topup_packages.sql convention: `INSERT ... SELECT
-- ... FROM organizations` (every existing org, not one hardcoded slug) with
-- deterministic `${org_id}__fac-${slug}` / `${org_id}__pkg-${slug}` ids and
-- `ON CONFLICT (id) DO NOTHING`, so re-applying against a DB that already
-- has orgs is a no-op. NOTE: on a genuinely fresh `supabase db reset` this
-- INSERT affects zero rows (no organizations exist yet — orgs are created by
-- scripts/seed-supabase.ts, which runs after migrations, not by a
-- supabase/seed.sql this project doesn't have); the actual seeding path is
-- `pnpm db:seed:supabase`. This migration exists so any org created directly
-- against Postgres (bypassing the seed script) still gets a bookable catalog,
-- matching OBS-800..803/826 and spec migration-delta item 6.

INSERT INTO "facilities" ("id","org_id","name","type","rate_per_hour_rupiah","capacity","seat_label","zone","max_hours_cap","available")
SELECT o."id" || '__fac-meja-a', o."id", 'Meja A', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'A', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-b', o."id", 'Meja B', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'B', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-c', o."id", 'Meja C', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'C', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-d', o."id", 'Meja D', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'D', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-e', o."id", 'Meja E', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'E', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-f', o."id", 'Meja F', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'F', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-g', o."id", 'Meja G', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'G', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-h', o."id", 'Meja H', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'H', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-i', o."id", 'Meja I', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'I', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-j', o."id", 'Meja J', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'J', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-k', o."id", 'Meja K', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'K', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meja-l', o."id", 'Meja L', 'COWORKING_SEAT'::"FacilityType", 25000, 1, 'L', 'DESK', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-counter-1', o."id", 'Counter 1', 'COWORKING_SEAT'::"FacilityType", 20000, 1, '1', 'COUNTER', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-counter-2', o."id", 'Counter 2', 'COWORKING_SEAT'::"FacilityType", 20000, 1, '2', 'COUNTER', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-counter-3', o."id", 'Counter 3', 'COWORKING_SEAT'::"FacilityType", 20000, 1, '3', 'COUNTER', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-counter-4', o."id", 'Counter 4', 'COWORKING_SEAT'::"FacilityType", 20000, 1, '4', 'COUNTER', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-counter-5', o."id", 'Counter 5', 'COWORKING_SEAT'::"FacilityType", 20000, 1, '5', 'COUNTER', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-counter-6', o."id", 'Counter 6', 'COWORKING_SEAT'::"FacilityType", 20000, 1, '6', 'COUNTER', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-counter-7', o."id", 'Counter 7', 'COWORKING_SEAT'::"FacilityType", 20000, 1, '7', 'COUNTER', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-counter-8', o."id", 'Counter 8', 'COWORKING_SEAT'::"FacilityType", 20000, 1, '8', 'COUNTER', 4, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meeting-room-a', o."id", 'Meeting Room A', 'MEETING_ROOM'::"FacilityType", 150000, 10, NULL, 'MEETING', NULL, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-meeting-room-b', o."id", 'Meeting Room B', 'MEETING_ROOM'::"FacilityType", 120000, 8, NULL, 'MEETING', NULL, true FROM "organizations" o
UNION ALL SELECT o."id" || '__fac-full-room-event', o."id", 'Full Room Event', 'FULL_ROOM'::"FacilityType", 350000, 20, NULL, 'FULL_ROOM', NULL, true FROM "organizations" o
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "time_credit_packages" ("id","org_id","name","hours","price_rupiah","price_per_hour_rupiah","popular","sort_order")
SELECT o."id" || '__pkg-5h', o."id", '5 Hours', 5, 75000, 15000, false, 1 FROM "organizations" o
UNION ALL SELECT o."id" || '__pkg-10h', o."id", '10 Hours', 10, 140000, 14000, true, 2 FROM "organizations" o
UNION ALL SELECT o."id" || '__pkg-20h', o."id", '20 Hours', 20, 260000, 13000, false, 3 FROM "organizations" o
UNION ALL SELECT o."id" || '__pkg-50h', o."id", '50 Hours', 50, 600000, 12000, false, 4 FROM "organizations" o
ON CONFLICT ("id") DO NOTHING;
