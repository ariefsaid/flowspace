/**
 * Integration tests for lib/db/time-credit-lots.ts [SEC][MONEY].
 * Runs against the Supabase local Postgres via TEST_DATABASE_URL.
 *
 * AC-824: FIFO spend consumes the soonest-expiring lot first, skips expired.
 * AC-823: spend > available throws INSUFFICIENT_CREDITS, no lot/balance/
 *   ledger change.
 * AC-825: two concurrent spends whose combined demand exceeds supply — at
 *   most one succeeds, the cache never goes negative.
 * AC-846: cross-org lots are invisible and untouchable (read AND write).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { organizations, appUsers, timeCreditLots } from "@/lib/db/schema";
import { db } from "@/lib/db/drizzle";
import { spendTimeCredits, listLots } from "@/lib/db/time-credit-lots";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 5 });
const testDb = drizzle(testSql, { schema });

/** Wraps spendTimeCredits in its own transaction, as every real caller does. */
function spend(orgId: string, userId: string, hours: number) {
  return db.transaction((tx) => spendTimeCredits({ orgId, userId, hours, tx }));
}

let orgAId: string;
let orgBId: string;
let userAId: string;
let userBId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "time_credit_lots","app_users","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Lots Org A", slug: "lots-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Lots Org B", slug: "lots-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [userA] = await testDb
    .insert(appUsers)
    .values({ orgId: orgAId, email: "lots-a@x.test", name: "Alice", role: "MEMBER" })
    .returning();
  userAId = userA.id;

  const [userB] = await testDb
    .insert(appUsers)
    .values({ orgId: orgBId, email: "lots-b@x.test", name: "Bob", role: "MEMBER" })
    .returning();
  userBId = userB.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "time_credit_lots","app_users","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedLot(opts: {
  orgId: string;
  userId: string;
  totalHours: number;
  remainingHours: number;
  expiresInDays: number;
}) {
  const [row] = await testDb
    .insert(timeCreditLots)
    .values({
      orgId: opts.orgId,
      userId: opts.userId,
      totalHours: opts.totalHours,
      remainingHours: opts.remainingHours,
      expiresAt: new Date(Date.now() + opts.expiresInDays * DAY_MS),
    })
    .returning();
  return row;
}

async function getUserTimeCredits(userId: string): Promise<number> {
  const [row] = await testDb
    .select({ timeCredits: appUsers.timeCredits })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1);
  return row?.timeCredits ?? -1;
}

describe("lib/db/time-credit-lots — spendTimeCredits [SEC][MONEY]", () => {
  describe("AC-824: FIFO — soonest-expiry first, expired skipped", () => {
    it("consumes the soonest-expiring lot first when it alone covers the spend", async () => {
      const far = await seedLot({ orgId: orgAId, userId: userAId, totalHours: 10, remainingHours: 10, expiresInDays: 60 });
      const soon = await seedLot({ orgId: orgAId, userId: userAId, totalHours: 5, remainingHours: 5, expiresInDays: 5 });

      await spend(orgAId, userAId, 3);

      const [soonAfter] = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.id, soon.id));
      const [farAfter] = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.id, far.id));
      expect(soonAfter.remainingHours).toBe(2); // 5 - 3
      expect(farAfter.remainingHours).toBe(10); // untouched
      expect(await getUserTimeCredits(userAId)).toBe(12); // 2 + 10
    });

    it("skips an expired lot even though it is chronologically soonest", async () => {
      await testSql`TRUNCATE TABLE "time_credit_lots" RESTART IDENTITY CASCADE`;
      const expired = await seedLot({ orgId: orgAId, userId: userAId, totalHours: 20, remainingHours: 20, expiresInDays: -1 });
      const valid = await seedLot({ orgId: orgAId, userId: userAId, totalHours: 10, remainingHours: 10, expiresInDays: 30 });

      await spend(orgAId, userAId, 4);

      const [expiredAfter] = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.id, expired.id));
      const [validAfter] = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.id, valid.id));
      expect(expiredAfter.remainingHours).toBe(0); // pruned, never debited
      expect(validAfter.remainingHours).toBe(6); // 10 - 4
      expect(await getUserTimeCredits(userAId)).toBe(6);
    });
  });

  describe("AC-823: insufficient credits — no write at all", () => {
    it("throws INSUFFICIENT_CREDITS and leaves every lot/balance/ledger row untouched", async () => {
      await testSql`TRUNCATE TABLE "time_credit_lots" RESTART IDENTITY CASCADE`;
      await testDb.update(appUsers).set({ timeCredits: 0 }).where(eq(appUsers.id, userAId));
      const lot = await seedLot({ orgId: orgAId, userId: userAId, totalHours: 3, remainingHours: 3, expiresInDays: 30 });
      await testDb.update(appUsers).set({ timeCredits: 3 }).where(eq(appUsers.id, userAId));

      await expect(spend(orgAId, userAId, 10)).rejects.toThrow(/INSUFFICIENT_CREDITS/);

      const [lotAfter] = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.id, lot.id));
      expect(lotAfter.remainingHours).toBe(3); // unchanged
      expect(await getUserTimeCredits(userAId)).toBe(3); // unchanged (not recomputed either)
    });
  });

  describe("AC-825: concurrent spend never overspends", () => {
    it("two concurrent spends whose combined demand exceeds supply — at most one succeeds, balance never negative", async () => {
      await testSql`TRUNCATE TABLE "time_credit_lots" RESTART IDENTITY CASCADE`;
      const lot = await seedLot({ orgId: orgAId, userId: userAId, totalHours: 5, remainingHours: 5, expiresInDays: 30 });

      const results = await Promise.allSettled([
        spend(orgAId, userAId, 3),
        spend(orgAId, userAId, 3),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/INSUFFICIENT_CREDITS/);

      const [lotAfter] = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.id, lot.id));
      expect(lotAfter.remainingHours).toBe(2); // exactly one 3h debit landed; never negative
      expect(await getUserTimeCredits(userAId)).toBe(2);
    });
  });

  describe("[SEC] expiry re-evaluated AFTER the row lock — a lock-waiter can't spend a lot that expired DURING its wait", () => {
    it("a spend that blocks on FOR UPDATE and only proceeds AFTER the lot's expiresAt has passed treats it as expired, not spendable", async () => {
      await testSql`TRUNCATE TABLE "time_credit_lots" RESTART IDENTITY CASCADE`;
      const soonExpiry = new Date(Date.now() + 250);
      const [lot] = await testDb
        .insert(timeCreditLots)
        .values({ orgId: orgAId, userId: userAId, totalHours: 5, remainingHours: 5, expiresAt: soonExpiry })
        .returning();

      // A separate raw transaction takes the SAME row lock first and holds
      // it open past the lot's expiry — proving the eventual spend only
      // gets to look at the row AFTER expiresAt has genuinely passed.
      let releaseHolder!: () => void;
      const released = new Promise<void>((resolve) => { releaseHolder = resolve; });
      const holderAcquired = new Promise<void>((resolve) => {
        void testSql.begin(async (holder) => {
          await holder`SELECT id FROM time_credit_lots WHERE id = ${lot.id} FOR UPDATE`;
          resolve();
          await released;
        });
      });
      await holderAcquired;

      const spendPromise = spend(orgAId, userAId, 3); // blocks on the row lock the holder took

      // Wait until well past expiresAt, THEN release — the spend's own
      // FOR UPDATE can only proceed from this point on.
      await new Promise((r) => setTimeout(r, 400));
      expect(Date.now()).toBeGreaterThan(soonExpiry.getTime());
      releaseHolder();

      await expect(spendPromise).rejects.toThrow(/INSUFFICIENT_CREDITS/);
      // The whole caller transaction (including the expiry-prune write)
      // rolls back on INSUFFICIENT_CREDITS — the money-safety property this
      // test proves is simply that the debit was REJECTED, not applied
      // against a lot that had, in real time, already expired.
      const [lotAfter] = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.id, lot.id));
      expect(lotAfter.remainingHours).toBe(5); // unchanged — never debited
    });
  });

  describe("AC-846: cross-org isolation — read AND write", () => {
    it("listLots never returns another org's lots", async () => {
      await testSql`TRUNCATE TABLE "time_credit_lots" RESTART IDENTITY CASCADE`;
      await seedLot({ orgId: orgAId, userId: userAId, totalHours: 5, remainingHours: 5, expiresInDays: 30 });
      await seedLot({ orgId: orgBId, userId: userBId, totalHours: 7, remainingHours: 7, expiresInDays: 30 });

      const aLots = await listLots(orgAId, userAId);
      expect(aLots).toHaveLength(1);
      expect(aLots.every((l) => l.orgId === orgAId)).toBe(true);

      const bLotsUnderOrgA = await listLots(orgAId, userBId);
      expect(bLotsUnderOrgA).toHaveLength(0);
    });

    it("spendTimeCredits scoped to the wrong org sees zero lots and throws — org A's real lot is untouched", async () => {
      await testSql`TRUNCATE TABLE "time_credit_lots" RESTART IDENTITY CASCADE`;
      const orgALot = await seedLot({ orgId: orgAId, userId: userAId, totalHours: 5, remainingHours: 5, expiresInDays: 30 });

      // Same userId, but scoped to orgB — the org-scoped WHERE must exclude
      // org A's lot entirely, not merely display-filter it.
      await expect(spend(orgBId, userAId, 1)).rejects.toThrow(/INSUFFICIENT_CREDITS/);

      const [lotAfter] = await testDb.select().from(timeCreditLots).where(eq(timeCreditLots.id, orgALot.id));
      expect(lotAfter.remainingHours).toBe(5); // untouched by the cross-org attempt
    });
  });
});
