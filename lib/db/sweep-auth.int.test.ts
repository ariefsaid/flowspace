/**
 * Integration test for the authenticated booking-status-sweep route
 * (app/api/cron/booking-status-sweep/route.ts, I-040 Phase 10 / FR-852).
 *
 * ORIG's sweep endpoint accepted unauthenticated requests (OBS-840, a
 * defect). This proves the fix: a public GET/POST or a wrong/missing Bearer
 * credential writes NOTHING and returns 401 (AC-837); the correct
 * `BOOKING_SWEEP_SECRET` credential runs the real repository sweep against a
 * real Postgres org+booking fixture.
 *
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL, using the
 * app's own `lib/db/drizzle` singleton (the route module imports it) rather
 * than a dedicated test client — the route resolves its org via `DATABASE_URL`,
 * so this test's fixtures must be visible on that same connection.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { organizations, appUsers, facilities, bookings } from "@/lib/db/schema";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

const SECRET = "test-sweep-secret";
const SLUG = "sweep-auth-org-test";

let orgId: string;
let userId: string;
let facilityId: string;
let toActivateId: string;

beforeAll(async () => {
  process.env.BOOKING_SWEEP_SECRET = SECRET;
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [org] = await testDb.insert(organizations).values({ name: "Sweep Auth Org", slug: SLUG }).returning();
  orgId = org.id;
  const [user] = await testDb.insert(appUsers).values({ orgId, email: "sweep@x.test", name: "Sweep User", role: "MEMBER" }).returning();
  userId = user.id;
  const [fac] = await testDb.insert(facilities).values({ orgId, name: "Meja A", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, available: true }).returning();
  facilityId = fac.id;
}, 30_000);

beforeEach(async () => {
  await testSql`DELETE FROM "bookings" WHERE org_id = ${orgId}`;
  const now = new Date();
  const [toActivate] = await testDb
    .insert(bookings)
    .values({
      orgId, userId, facilityType: "COWORKING_SEAT", facilityId, facilityName: "Meja A",
      startAt: new Date(now.getTime() - 60_000), endAt: new Date(now.getTime() + 3_600_000),
      durationHours: 1, ratePerHourRupiah: 20000, amountRupiah: 20000, baseAmountRupiah: 20000, discountRupiah: 0,
      status: "CONFIRMED", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
    })
    .returning();
  toActivateId = toActivate.id;
});

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

// Import AFTER env var is set (module-level reads happen per-request, not at
// import time, but this keeps intent obvious).
import { GET, POST } from "@/app/api/cron/booking-status-sweep/route";

describe("booking-status-sweep route — authenticated entry (AC-837/FR-852)", () => {
  it("AC-837: a public GET with no Authorization header returns 401 and writes nothing", async () => {
    const res = await GET(new Request(`http://localhost/api/cron/booking-status-sweep?org=${SLUG}`));
    expect(res.status).toBe(401);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("CONFIRMED"); // unchanged
  });

  it("AC-837: a wrong Bearer credential returns 401 and writes nothing", async () => {
    const res = await GET(
      new Request(`http://localhost/api/cron/booking-status-sweep?org=${SLUG}`, {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(res.status).toBe(401);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("CONFIRMED");
  });

  it("AC-837: an unauthenticated POST returns 401 and writes nothing", async () => {
    const res = await POST(new Request(`http://localhost/api/cron/booking-status-sweep?org=${SLUG}`, { method: "POST" }));
    expect(res.status).toBe(401);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("CONFIRMED");
  });

  it("with the correct BOOKING_SWEEP_SECRET, GET returns 200 and the repository sweep actually ran", async () => {
    const res = await GET(
      new Request(`http://localhost/api/cron/booking-status-sweep?org=${SLUG}`, {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activated).toBeGreaterThanOrEqual(1);

    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("ACTIVE");
  });

  it("resolves the org server-side by slug — an unknown org slug is 404, no write anywhere", async () => {
    const res = await GET(
      new Request(`http://localhost/api/cron/booking-status-sweep?org=does-not-exist-slug`, {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(404);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("CONFIRMED");
  });
});
