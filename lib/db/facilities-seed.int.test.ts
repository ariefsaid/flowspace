/**
 * Integration test for the I-040 facility catalog seed (AC-800, OBS-800..803).
 * Seeds the canonical lib/booking/catalog.ts FACILITY_CATALOG into a fresh
 * org via Drizzle (the exact shape supabase/migrations/0016_booking_seed.sql
 * and scripts/seed-supabase.ts both insert) and asserts the 23-row catalog's
 * exact rates/capacities/zones/labels/caps, plus org isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { organizations, facilities } from "@/lib/db/schema";
import { FACILITY_CATALOG } from "@/lib/booking/catalog";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

let orgAId: string;
let orgBId: string;

async function seedCatalog(orgId: string) {
  for (const f of FACILITY_CATALOG) {
    await testDb
      .insert(facilities)
      .values({
        id: `${orgId}__fac-${f.slug}`,
        orgId,
        name: f.name,
        type: f.type,
        ratePerHourRupiah: f.ratePerHourRupiah,
        capacity: f.capacity,
        seatLabel: f.seatLabel,
        zone: f.zone,
        maxHoursCap: f.maxHoursCap,
      })
      .onConflictDoNothing();
  }
}

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "facilities","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Facilities Seed Org A", slug: "facilities-seed-org-a" })
    .returning();
  orgAId = orgA.id;
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Facilities Seed Org B", slug: "facilities-seed-org-b" })
    .returning();
  orgBId = orgB.id;

  await seedCatalog(orgAId);
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "facilities","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("I-040 facility catalog seed — AC-800", () => {
  it("AC-800: seeds exactly 23 rows for the org", async () => {
    const rows = await testDb.select().from(facilities).where(eq(facilities.orgId, orgAId));
    expect(rows).toHaveLength(23);
  });

  it("AC-800: 12 desks A-L at Rp25.000/h, capacity 1, zone DESK, cap 4h (OBS-800)", async () => {
    const rows = await testDb
      .select()
      .from(facilities)
      .where(eq(facilities.orgId, orgAId));
    const desks = rows.filter((r) => r.zone === "DESK");
    expect(desks).toHaveLength(12);
    for (const d of desks) {
      expect(d.type).toBe("COWORKING_SEAT");
      expect(d.ratePerHourRupiah).toBe(25_000);
      expect(d.capacity).toBe(1);
      expect(d.maxHoursCap).toBe(4);
      expect(d.seatLabel).toMatch(/^[A-L]$/);
    }
    expect(desks.map((d) => d.seatLabel).sort()).toEqual(
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"],
    );
  });

  it("AC-800: 8 counters 1-8 at Rp20.000/h, capacity 1, zone COUNTER, cap 4h (OBS-801)", async () => {
    const rows = await testDb
      .select()
      .from(facilities)
      .where(eq(facilities.orgId, orgAId));
    const counters = rows.filter((r) => r.zone === "COUNTER");
    expect(counters).toHaveLength(8);
    for (const c of counters) {
      expect(c.type).toBe("COWORKING_SEAT");
      expect(c.ratePerHourRupiah).toBe(20_000);
      expect(c.capacity).toBe(1);
      expect(c.maxHoursCap).toBe(4);
    }
    expect(counters.map((c) => c.seatLabel).sort()).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8"],
    );
  });

  it("AC-800: Meeting Room A (cap 10, Rp150.000/h) and B (cap 8, Rp120.000/h), zone MEETING, no hour cap (OBS-802)", async () => {
    const rows = await testDb
      .select()
      .from(facilities)
      .where(eq(facilities.orgId, orgAId));
    const meetingA = rows.find((r) => r.name === "Meeting Room A");
    const meetingB = rows.find((r) => r.name === "Meeting Room B");
    expect(meetingA).toMatchObject({
      type: "MEETING_ROOM",
      ratePerHourRupiah: 150_000,
      capacity: 10,
      zone: "MEETING",
      maxHoursCap: null,
    });
    expect(meetingB).toMatchObject({
      type: "MEETING_ROOM",
      ratePerHourRupiah: 120_000,
      capacity: 8,
      zone: "MEETING",
      maxHoursCap: null,
    });
  });

  it("AC-800: capacity-20 full-room event at Rp350.000/h, zone FULL_ROOM (OBS-803)", async () => {
    const rows = await testDb
      .select()
      .from(facilities)
      .where(eq(facilities.orgId, orgAId));
    const fullRoom = rows.find((r) => r.type === "FULL_ROOM");
    expect(fullRoom).toMatchObject({
      ratePerHourRupiah: 350_000,
      capacity: 20,
      zone: "FULL_ROOM",
    });
  });

  it("AC-800: org isolation — org B's identical query returns none", async () => {
    const rows = await testDb.select().from(facilities).where(eq(facilities.orgId, orgBId));
    expect(rows).toHaveLength(0);
  });
});
