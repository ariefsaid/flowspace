/**
 * Integration tests for lib/db/printers.ts (I-043, spec 0009).
 *
 * : create/edit/archive persist all CRUD fields; per-org unique names;
 *         active/default selection behaves.
 * : concurrent default writes leave at most one non-archived default
 *         per org.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { organizations, printers } from "@/lib/db/schema";
import {
  listActivePrinters,
  listPrintersForAdmin,
  createPrinter,
  updatePrinter,
  archivePrinter,
  setDefaultPrinter,
} from "@/lib/db/printers";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:34322/postgres";
const testSql = postgres(TEST_URL, { prepare: false, max: 3 });
const testDb = drizzle(testSql, { schema });

let orgAId: string;
let orgBId: string;

beforeAll(async () => {
  await testSql`TRUNCATE TABLE "print_jobs","printers","organizations" RESTART IDENTITY CASCADE`;
  const [orgA] = await testDb
    .insert(organizations)
    .values({ name: "Printer Org A", slug: "printer-org-a-test" })
    .returning();
  const [orgB] = await testDb
    .insert(organizations)
    .values({ name: "Printer Org B", slug: "printer-org-b-test" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;
}, 30_000);

afterAll(async () => {
  await testSql`TRUNCATE TABLE "print_jobs","printers","organizations" RESTART IDENTITY CASCADE`;
  await testSql.end();
}, 30_000);

describe("printers repository", () => {
  let hpA: string;
  let epsonA: string;
  let hpB: string;

  it("AC-609: createPrinter persists every CRUD field", async () => {
    hpA = await createPrinter(orgAId, {
      name: "HP_LaserJet_A",
      displayName: "LaserJet Lantai 1",
      location: "Lobby",
      printerType: "LASER",
      colorSupport: false,
      paperSizes: ["A4", "F4"],
      sortOrder: 1,
    });
    const [row] = await testDb.select().from(printers).where(eq(printers.id, hpA));
    expect(row).toMatchObject({
      orgId: orgAId,
      name: "HP_LaserJet_A",
      displayName: "LaserJet Lantai 1",
      location: "Lobby",
      printerType: "LASER",
      colorSupport: false,
      isActive: true,
      isDefault: false,
      sortOrder: 1,
    });
    expect(row.paperSizes).toEqual(["A4", "F4"]);
    expect(row.archivedAt).toBeNull();
  });

  it(": the same printer name is allowed in another org but unique within one org", async () => {
    // Same name, different org — allowed (org-scoped uniqueness).
    hpB = await createPrinter(orgBId, {
      name: "HP_LaserJet_A",
      displayName: "Org B printer",
      colorSupport: true,
      paperSizes: ["A4", "A3"],
    });
    // Duplicate name within org A rejects with no write.
    await expect(
      createPrinter(orgAId, {
        name: "HP_LaserJet_A",
        displayName: "Dup",
        colorSupport: false,
        paperSizes: ["A4"],
      }),
    ).rejects.toThrow(/PRINTER_NAME_EXISTS/);
    const [{ count }] = await testSql`
      select count(*)::int as count from printers where org_id = ${orgAId}`;
    expect(count).toBe(1);
  });

  it(": createPrinter validates name/paper sizes (no write on invalid)", async () => {
    await expect(
      createPrinter(orgAId, { name: "  ", displayName: "X", colorSupport: false, paperSizes: ["A4"] }),
    ).rejects.toThrow(/INVALID_PRINTER/);
    await expect(
      createPrinter(orgAId, { name: "Y", displayName: "", colorSupport: false, paperSizes: ["A4"] }),
    ).rejects.toThrow(/INVALID_PRINTER/);
    await expect(
      createPrinter(orgAId, { name: "Y", displayName: "Y", colorSupport: false, paperSizes: ["A9"] as unknown as "A4"[] }),
    ).rejects.toThrow(/INVALID_PRINTER/);
  });

  it(": updatePrinter edits fields org-scoped; cross-org id is NOT_FOUND", async () => {
    epsonA = await createPrinter(orgAId, {
      name: "Epson_Color",
      displayName: "Epson Lama",
      colorSupport: true,
      paperSizes: ["A4"],
      sortOrder: 2,
    });
    await updatePrinter(orgAId, epsonA, {
      displayName: "Epson Baru",
      location: "Ruang Meeting",
      colorSupport: true,
      paperSizes: ["A4", "A3", "F4"],
      sortOrder: 3,
    });
    const [row] = await testDb.select().from(printers).where(eq(printers.id, epsonA));
    expect(row.displayName).toBe("Epson Baru");
    expect(row.location).toBe("Ruang Meeting");
    expect(row.paperSizes).toEqual(["A4", "A3", "F4"]);
    expect(row.sortOrder).toBe(3);

    // org A cannot update org B's printer.
    await expect(
      updatePrinter(orgAId, hpB, { displayName: "HACK" }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it(": setDefaultPrinter unmarks other defaults in the org, never cross-org", async () => {
    await setDefaultPrinter(orgAId, hpA);
    let [row] = await testDb.select().from(printers).where(eq(printers.id, hpA));
    expect(row.isDefault).toBe(true);

    await setDefaultPrinter(orgAId, epsonA);
    [row] = await testDb.select().from(printers).where(eq(printers.id, epsonA));
    expect(row.isDefault).toBe(true);
    const [old] = await testDb.select().from(printers).where(eq(printers.id, hpA));
    expect(old.isDefault).toBe(false);

    // org B's printers untouched.
    const [bRow] = await testDb.select().from(printers).where(eq(printers.id, hpB));
    expect(bRow.isDefault).toBe(false);

    // Setting a default on an archived printer rejects.
    await archivePrinter(orgAId, hpA);
    await expect(setDefaultPrinter(orgAId, hpA)).rejects.toThrow(/ARCHIVED/);
  });

  it(": archivePrinter soft-archives; active listing excludes archived, admin listing includes", async () => {
    await archivePrinter(orgAId, hpA);
    const [row] = await testDb.select().from(printers).where(eq(printers.id, hpA));
    expect(row.archivedAt).not.toBeNull();
    expect(row.isActive).toBe(false);

    const active = await listActivePrinters(orgAId);
    expect(active.every((p) => p.archivedAt === null && p.isActive)).toBe(true);
    expect(active.some((p) => p.id === hpA)).toBe(false);
    expect(active.some((p) => p.id === epsonA)).toBe(true);

    const admin = await listPrintersForAdmin(orgAId);
    expect(admin.some((p) => p.id === hpA)).toBe(true);
    expect(admin.every((p) => p.orgId === orgAId)).toBe(true);
  });

  it("AC-633: concurrent default writes leave at most one non-archived default", async () => {
    // Three org-A printers + two concurrent default flips.
    const p1 = await createPrinter(orgAId, {
      name: "Race_One",
      displayName: "R1",
      colorSupport: false,
      paperSizes: ["A4"],
    });
    const p2 = await createPrinter(orgAId, {
      name: "Race_Two",
      displayName: "R2",
      colorSupport: false,
      paperSizes: ["A4"],
    });
    await Promise.all([setDefaultPrinter(orgAId, p1), setDefaultPrinter(orgAId, p2)]);

    const defaults = await testDb
      .select()
      .from(printers)
      .where(
        and(
          eq(printers.orgId, orgAId),
          eq(printers.isDefault, true),
          isNull(printers.archivedAt),
        ),
      );
    expect(defaults.length).toBe(1);

    // The partial unique index also backstops direct writes: a second
    // non-archived default insert violates it.
    await expect(() =>
      testSql`
        insert into printers (id, org_id, name, display_name, is_default)
        values ('violator', ${orgAId}, 'Violator', 'V', true)`,
    ).rejects.toThrow(/printers_org_single_default_idx/);
  });
});
