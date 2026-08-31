/**
 * Repository: facilities (admin CRUD, I-042). [SEC] money-adjacent — the
 * booking flow reads `ratePerHourRupiah` from this table. Every function
 * takes a server-derived `orgId` (never client-supplied, ADR-0004); the
 * caller (the settings page's server action) enforces ADMIN role. Writes
 * validate a non-negative integer rate/capacity/cap; archive is soft
 * (`archivedAt`) — never a hard delete.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { facilities, type Facility } from "@/lib/db/schema";
import type { FacilityType } from "@/lib/db/enums";

export type FacilityInput = {
  name: string;
  type: FacilityType;
  ratePerHourRupiah: number;
  capacity?: number | null;
  seatLabel?: string | null;
  zone?: string | null;
  maxHoursCap?: number | null;
  available?: boolean;
};

export type FacilityUpdateInput = Partial<FacilityInput>;

/** Postgres `integer` column max — beyond this the DB itself would throw a
 * generic "value out of range for type integer" error; reject it here first
 * with a stable, field-named error instead. */
const INT4_MAX = 2_147_483_647;

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > INT4_MAX) {
    throw new Error(`INVALID_${label}`);
  }
}

function assertValidFacilityFields(input: FacilityUpdateInput): void {
  if (input.ratePerHourRupiah !== undefined) {
    assertNonNegativeInt(input.ratePerHourRupiah, "RATE");
  }
  if (input.capacity !== undefined && input.capacity !== null) {
    assertNonNegativeInt(input.capacity, "CAPACITY");
  }
  if (input.maxHoursCap !== undefined && input.maxHoursCap !== null) {
    assertNonNegativeInt(input.maxHoursCap, "MAX_HOURS_CAP");
  }
}

/** All non-archived facilities for the org, ordered by type then name (admin editor). */
export function listFacilitiesForAdmin(orgId: string): Promise<Facility[]> {
  return db
    .select()
    .from(facilities)
    .where(and(eq(facilities.orgId, orgId), isNull(facilities.archivedAt)))
    .orderBy(asc(facilities.type), asc(facilities.name));
}

/** Insert one facility for the org (ADMIN-only — caller enforces role). */
export async function createFacility(orgId: string, input: FacilityInput): Promise<Facility> {
  assertValidFacilityFields(input);
  const [row] = await db
    .insert(facilities)
    .values({
      orgId,
      name: input.name,
      type: input.type,
      ratePerHourRupiah: input.ratePerHourRupiah,
      capacity: input.capacity ?? null,
      seatLabel: input.seatLabel ?? null,
      zone: input.zone ?? null,
      maxHoursCap: input.maxHoursCap ?? null,
      available: input.available ?? true,
    })
    .returning();
  return row;
}

/**
 * Build an explicit allowlisted patch from `input` — [SEC] never spread
 * `input` into `.set()`. A caller's raw JSON body can carry ANY key
 * regardless of the `FacilityUpdateInput` TS type (e.g. a crafted `orgId` to
 * reassign the row cross-org, or `id`/`archivedAt` to retarget/tamper with
 * another row) — only the intended editable columns are ever copied.
 */
function toFacilityPatch(input: FacilityUpdateInput): Partial<typeof facilities.$inferInsert> {
  const patch: Partial<typeof facilities.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.type !== undefined) patch.type = input.type;
  if (input.ratePerHourRupiah !== undefined) patch.ratePerHourRupiah = input.ratePerHourRupiah;
  if (input.capacity !== undefined) patch.capacity = input.capacity;
  if (input.seatLabel !== undefined) patch.seatLabel = input.seatLabel;
  if (input.zone !== undefined) patch.zone = input.zone;
  if (input.maxHoursCap !== undefined) patch.maxHoursCap = input.maxHoursCap;
  if (input.available !== undefined) patch.available = input.available;
  return patch;
}

/** Patch a facility's fields in place (ADMIN-only — caller enforces role). */
export async function updateFacility(
  orgId: string,
  id: string,
  input: FacilityUpdateInput,
): Promise<void> {
  assertValidFacilityFields(input);
  await db
    .update(facilities)
    .set({ ...toFacilityPatch(input), updatedAt: new Date() })
    .where(and(eq(facilities.orgId, orgId), eq(facilities.id, id)));
}

/** Soft-archive a facility — never a hard delete (booking history keeps its FK). */
export async function archiveFacility(orgId: string, id: string): Promise<void> {
  await db
    .update(facilities)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(facilities.orgId, orgId), eq(facilities.id, id)));
}
