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
 * [SEC] Also proves the org-scope fix (finding #8): the swept org is
 * resolved ONLY from `BOOKING_SWEEP_ORG_SLUG`/`SEED_ORG_SLUG` env — a
 * `?org=` query param (even one naming a REAL, different org) has NO
 * effect on which org gets swept, and never touches that other org's rows.
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

const SECRET = "test-sweep-secret-real-value"; // ≥20 chars — not "weak" (finding: reject placeholder/short secrets)
const SLUG = "sweep-auth-org-test";
const OTHER_SLUG = "sweep-auth-other-org-test";

let orgId: string;
let userId: string;
let facilityId: string;
let toActivateId: string;

let otherOrgId: string;
let otherUserId: string;
let otherFacilityId: string;
let otherToActivateId: string;

beforeAll(async () => {
  process.env.BOOKING_SWEEP_SECRET = SECRET;
  // [SEC] The server-configured scope for every test below — a `?org=`
  // query param must never override this.
  process.env.BOOKING_SWEEP_ORG_SLUG = SLUG;
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [org] = await testDb.insert(organizations).values({ name: "Sweep Auth Org", slug: SLUG }).returning();
  orgId = org.id;
  const [user] = await testDb.insert(appUsers).values({ orgId, email: "sweep@x.test", name: "Sweep User", role: "MEMBER" }).returning();
  userId = user.id;
  const [fac] = await testDb.insert(facilities).values({ orgId, name: "Meja A", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, available: true }).returning();
  facilityId = fac.id;

  // A SECOND, real org — proves a `?org=` targeting it has no effect.
  const [otherOrg] = await testDb.insert(organizations).values({ name: "Sweep Auth Other Org", slug: OTHER_SLUG }).returning();
  otherOrgId = otherOrg.id;
  const [otherUser] = await testDb.insert(appUsers).values({ orgId: otherOrgId, email: "sweep-other@x.test", name: "Other Sweep User", role: "MEMBER" }).returning();
  otherUserId = otherUser.id;
  const [otherFac] = await testDb.insert(facilities).values({ orgId: otherOrgId, name: "Meja Other", type: "COWORKING_SEAT", ratePerHourRupiah: 20000, available: true }).returning();
  otherFacilityId = otherFac.id;
}, 30_000);

beforeEach(async () => {
  await testSql`DELETE FROM "bookings" WHERE org_id = ${orgId} OR org_id = ${otherOrgId}`;
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

  const [otherToActivate] = await testDb
    .insert(bookings)
    .values({
      orgId: otherOrgId, userId: otherUserId, facilityType: "COWORKING_SEAT", facilityId: otherFacilityId, facilityName: "Meja Other",
      startAt: new Date(now.getTime() - 60_000), endAt: new Date(now.getTime() + 3_600_000),
      durationHours: 1, ratePerHourRupiah: 20000, amountRupiah: 20000, baseAmountRupiah: 20000, discountRupiah: 0,
      status: "CONFIRMED", paymentStatus: "PAID_ONLINE", bookingMode: "SCHEDULED", paymentMethod: "online",
    })
    .returning();
  otherToActivateId = otherToActivate.id;
});

afterAll(async () => {
  await testSql`TRUNCATE TABLE "transactions","bookings","facilities","app_users","organizations" RESTART IDENTITY CASCADE`;
  delete process.env.BOOKING_SWEEP_ORG_SLUG;
  await testSql.end();
}, 30_000);

// Import AFTER env var is set (module-level reads happen per-request, not at
// import time, but this keeps intent obvious).
import { GET, POST } from "@/app/api/cron/booking-status-sweep/route";

describe("booking-status-sweep route — authenticated entry (AC-837/FR-852)", () => {
  it("AC-837: a public GET with no Authorization header returns 401 and writes nothing", async () => {
    const res = await GET(new Request(`http://localhost/api/cron/booking-status-sweep`));
    expect(res.status).toBe(401);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("CONFIRMED"); // unchanged
  });

  it("AC-837: a wrong Bearer credential returns 401 and writes nothing", async () => {
    const res = await GET(
      new Request(`http://localhost/api/cron/booking-status-sweep`, {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(res.status).toBe(401);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("CONFIRMED");
  });

  it("AC-837: an unauthenticated POST returns 401 and writes nothing", async () => {
    const res = await POST(new Request(`http://localhost/api/cron/booking-status-sweep`, { method: "POST" }));
    expect(res.status).toBe(401);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("CONFIRMED");
  });

  it("[SEC] a wrong credential of a DIFFERENT length than the real secret still fails closed (401), never a 5xx/crash", async () => {
    // A naive crypto.timingSafeEqual on mismatched-length buffers THROWS —
    // this proves the length guard fails closed instead of erroring.
    const res = await GET(
      new Request(`http://localhost/api/cron/booking-status-sweep`, {
        headers: { authorization: "Bearer x" }, // far shorter than SECRET
      }),
    );
    expect(res.status).toBe(401);
  });

  it("[SEC] an env secret set to the documented placeholder value is treated as unconfigured — 401 even with an exact-matching credential", async () => {
    const original = process.env.BOOKING_SWEEP_SECRET;
    process.env.BOOKING_SWEEP_SECRET = "REPLACE_WITH_A_RANDOM_SECRET";
    try {
      const res = await GET(
        new Request(`http://localhost/api/cron/booking-status-sweep`, {
          headers: { authorization: "Bearer REPLACE_WITH_A_RANDOM_SECRET" },
        }),
      );
      expect(res.status).toBe(401);
    } finally {
      process.env.BOOKING_SWEEP_SECRET = original;
    }
  });

  it("[SEC] a too-short env secret is treated as unconfigured — 401 even with an exact-matching credential", async () => {
    const original = process.env.BOOKING_SWEEP_SECRET;
    process.env.BOOKING_SWEEP_SECRET = "short";
    try {
      const res = await GET(
        new Request(`http://localhost/api/cron/booking-status-sweep`, {
          headers: { authorization: "Bearer short" },
        }),
      );
      expect(res.status).toBe(401);
    } finally {
      process.env.BOOKING_SWEEP_SECRET = original;
    }
  });

  it("with the correct BOOKING_SWEEP_SECRET, GET returns 200 and the repository sweep actually ran", async () => {
    const res = await GET(
      new Request(`http://localhost/api/cron/booking-status-sweep`, {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activated).toBeGreaterThanOrEqual(1);

    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("ACTIVE");
  });

  it("[SEC] a ?org= query param naming a REAL, different org has NO effect — that org's rows stay untouched, the server-configured org is swept instead", async () => {
    const res = await GET(
      new Request(`http://localhost/api/cron/booking-status-sweep?org=${OTHER_SLUG}`, {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(200);

    // The server-configured org (SLUG) was swept, exactly as if ?org= were absent.
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("ACTIVE");

    // The org NAMED in the query param was NEVER touched.
    const [otherFresh] = await testDb.select().from(bookings).where(eq(bookings.id, otherToActivateId));
    expect(otherFresh.status).toBe("CONFIRMED");
  });

  it("[SEC] a ?org= naming a nonexistent slug ALSO has no effect — the server-configured org is still swept", async () => {
    const res = await GET(
      new Request(`http://localhost/api/cron/booking-status-sweep?org=does-not-exist-slug`, {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
    expect(fresh.status).toBe("ACTIVE");
  });

  it("resolves the org server-side from env — an unresolvable configured slug is 404, no write anywhere", async () => {
    const original = process.env.BOOKING_SWEEP_ORG_SLUG;
    process.env.BOOKING_SWEEP_ORG_SLUG = "does-not-exist-slug";
    try {
      const res = await GET(
        new Request(`http://localhost/api/cron/booking-status-sweep`, {
          headers: { authorization: `Bearer ${SECRET}` },
        }),
      );
      expect(res.status).toBe(404);
      const [fresh] = await testDb.select().from(bookings).where(eq(bookings.id, toActivateId));
      expect(fresh.status).toBe("CONFIRMED");
    } finally {
      process.env.BOOKING_SWEEP_ORG_SLUG = original;
    }
  });
});
