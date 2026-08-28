/**
 * Integration test for the I-040 booking-parity core migration (0014).
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL after
 * `pnpm exec supabase db reset`. Structural proof: new/altered
 * tables/columns/enum values/indexes exist and CHECK constraints enforce
 * their invariants at the DB level (defense-in-depth, NFR-800/801).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const sql = postgres(TEST_URL, { prepare: false, max: 3 });

let orgId: string;
let userId: string;

beforeAll(async () => {
  await sql`TRUNCATE TABLE "transactions","time_credit_lots","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [org] = await sql`
    INSERT INTO organizations (id, name, slug)
    VALUES (gen_random_uuid()::text, 'Booking Schema Org', 'booking-schema-org')
    RETURNING id`;
  orgId = org.id;

  const [user] = await sql`
    INSERT INTO app_users (id, org_id, email, name, role)
    VALUES (gen_random_uuid()::text, ${orgId}, 'bsch@x.test', 'BSch', 'MEMBER')
    RETURNING id`;
  userId = user.id;
}, 30_000);

afterAll(async () => {
  await sql`TRUNCATE TABLE "transactions","time_credit_lots","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;
  await sql.end();
}, 30_000);

describe("I-040 booking-parity migration (0014) — structure", () => {
  it("BookingStatus enum gains CONFIRMED", async () => {
    const enums = await sql`
      SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'BookingStatus'`;
    expect(enums.map((r) => r.enumlabel)).toEqual(
      expect.arrayContaining(["ACTIVE", "COMPLETED", "CANCELLED", "CONFIRMED"]),
    );
  });

  it("FacilityType enum gains FULL_ROOM", async () => {
    const enums = await sql`
      SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'FacilityType'`;
    expect(enums.map((r) => r.enumlabel)).toEqual(
      expect.arrayContaining(["COWORKING_SEAT", "MEETING_ROOM", "FULL_ROOM"]),
    );
  });

  it("BookingMode and BookingPaymentMethod enums exist", async () => {
    const modeEnums = await sql`
      SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'BookingMode'`;
    expect(modeEnums.map((r) => r.enumlabel).sort()).toEqual(["SCHEDULED", "WALKIN"]);

    const pmEnums = await sql`
      SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'BookingPaymentMethod'`;
    expect(pmEnums.map((r) => r.enumlabel).sort()).toEqual([
      "cashier",
      "online",
      "time_credits",
    ]);
  });

  it("bookings gains booking_mode/base_amount_rupiah/discount_rupiah/payment_method; status default is PENDING", async () => {
    const cols = await sql`
      SELECT column_name, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bookings'
        AND column_name IN ('booking_mode','base_amount_rupiah','discount_rupiah','payment_method','status')`;
    const names = cols.map((r) => r.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "booking_mode",
        "base_amount_rupiah",
        "discount_rupiah",
        "payment_method",
        "status",
      ]),
    );
    const statusCol = cols.find((r) => r.column_name === "status");
    expect(statusCol?.column_default).toMatch(/PENDING/);
  });

  it("facilities gains capacity/seat_label/zone/max_hours_cap", async () => {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'facilities'
        AND column_name IN ('capacity','seat_label','zone','max_hours_cap')`;
    expect(cols.map((r) => r.column_name).sort()).toEqual([
      "capacity",
      "max_hours_cap",
      "seat_label",
      "zone",
    ]);
  });

  it("transactions gains payment_method", async () => {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'payment_method'`;
    expect(cols.map((r) => r.column_name)).toEqual(["payment_method"]);
  });

  it("time_credit_lots table exists with its columns", async () => {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'time_credit_lots'`;
    const names = cols.map((r) => r.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "org_id",
        "user_id",
        "package_id",
        "purchase_transaction_id",
        "total_hours",
        "remaining_hours",
        "purchased_at",
        "expires_at",
        "created_at",
        "updated_at",
      ]),
    );
  });

  it("bookings has the org/facility/status/time composite index", async () => {
    const idx = await sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'bookings'
        AND indexname = 'bookings_org_facility_status_time_idx'`;
    expect(idx).toHaveLength(1);
  });

  it("time_credit_lots CHECK rejects a negative remaining_hours", async () => {
    await expect(
      sql`INSERT INTO time_credit_lots (id, org_id, user_id, total_hours, remaining_hours, expires_at)
          VALUES (gen_random_uuid()::text, ${orgId}, ${userId}, 5, -1, now() + interval '90 days')`,
    ).rejects.toThrow();
  });

  it("bookings CHECK rejects a scheduled row with facility_id NULL", async () => {
    await expect(
      sql`INSERT INTO bookings (id, org_id, user_id, facility_type, facility_id, facility_name, booking_mode, rate_per_hour_rupiah)
          VALUES (gen_random_uuid()::text, ${orgId}, ${userId}, 'COWORKING_SEAT', NULL, 'No Facility', 'SCHEDULED', 25000)`,
    ).rejects.toThrow();
  });

  it("bookings money CHECK rejects a negative base_amount_rupiah", async () => {
    await expect(
      sql`INSERT INTO bookings (id, org_id, user_id, facility_type, facility_name, booking_mode, rate_per_hour_rupiah, base_amount_rupiah)
          VALUES (gen_random_uuid()::text, ${orgId}, ${userId}, 'WALKIN_COWORKING', 'Walkin', 'WALKIN', 20000, -1)`,
    ).rejects.toThrow();
  });
});
