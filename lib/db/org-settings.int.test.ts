/**
 * Integration tests for lib/db/org-settings.ts (I-042 admin-settings foundation).
 *
 * AC-1100: getOrgSettings returns {} for a category with no row yet
 * AC-1101: setOrgSettings upserts, getOrgSettings reads it back
 * AC-1102: setOrgSettings on an existing category updates in place (no duplicate row)
 * AC-1103: unknown category is rejected — no write
 * AC-1104: org isolation — org B never sees org A's settings
 * AC-1105: setOrgSettings rejects an oversized total payload as a backstop — no write
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { organizations, orgSettings } from "@/lib/db/schema";
import { getOrgSettings, setOrgSettings } from "@/lib/db/org-settings";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";

const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

let orgAId: string;
let orgBId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "org_settings","organizations" RESTART IDENTITY CASCADE`;

  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Org Settings Org A", slug: "org-settings-org-a" })
    .returning();
  orgAId = orgA.id;

  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Org Settings Org B", slug: "org-settings-org-b" })
    .returning();
  orgBId = orgB.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "org_settings","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("lib/db/org-settings", () => {
  it("AC-1100: getOrgSettings returns {} for a category with no row yet", async () => {
    const settings = await getOrgSettings(orgAId, "site");
    expect(settings).toEqual({});
  });

  it("AC-1101: setOrgSettings upserts, getOrgSettings reads it back", async () => {
    await setOrgSettings(orgAId, "site", { siteName: "FlowSpace", tagline: "Work + Coffee" });

    const settings = await getOrgSettings(orgAId, "site");
    expect(settings).toEqual({ siteName: "FlowSpace", tagline: "Work + Coffee" });
  });

  it("AC-1102: setOrgSettings on an existing category updates in place (no duplicate row)", async () => {
    await setOrgSettings(orgAId, "analytics", { gaId: "G-FIRST" });
    await setOrgSettings(orgAId, "analytics", { gaId: "G-SECOND" });

    const settings = await getOrgSettings(orgAId, "analytics");
    expect(settings).toEqual({ gaId: "G-SECOND" });

    const rows = await testDb
      .select()
      .from(orgSettings)
      .where(and(eq(orgSettings.orgId, orgAId), eq(orgSettings.category, "analytics")));
    expect(rows).toHaveLength(1);
  });

  it("AC-1103: unknown category is rejected — no write", async () => {
    // @ts-expect-error — deliberately passing an invalid category to prove server-side validation.
    await expect(setOrgSettings(orgAId, "bogus", { x: 1 })).rejects.toThrow("INVALID_CATEGORY");

    const rows = await testDb
      .select()
      .from(orgSettings)
      .where(and(eq(orgSettings.orgId, orgAId), eq(orgSettings.category, "bogus")));
    expect(rows).toHaveLength(0);
  });

  it("AC-1104: org isolation — org B never sees org A's settings", async () => {
    await setOrgSettings(orgAId, "email", { fromAddress: "noreply@org-a.test" });

    const bSettings = await getOrgSettings(orgBId, "email");
    expect(bSettings).toEqual({});
  });

  it("[SEC] AC-1105: setOrgSettings rejects an oversized total payload as a backstop — no write", async () => {
    // Every settings action is expected to allowlist+cap its own fields
    // BEFORE calling setOrgSettings — this is the backstop for a bug in one
    // of those callers (or a future category) that forwards raw input,
    // guarding the jsonb column against unbounded growth either way.
    const oversized = { junk: "x".repeat(20_000) };
    await expect(setOrgSettings(orgAId, "unifi", oversized)).rejects.toThrow(
      "SETTINGS_TOO_LARGE",
    );

    const settings = await getOrgSettings(orgAId, "unifi");
    expect(settings).toEqual({});
  });
});
