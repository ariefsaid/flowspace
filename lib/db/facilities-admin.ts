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

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
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

/** Patch a facility's fields in place (ADMIN-only — caller enforces role). */
export async function updateFacility(
  orgId: string,
  id: string,
  input: FacilityUpdateInput,
): Promise<void> {
  assertValidFacilityFields(input);
  await db
    .update(facilities)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(facilities.orgId, orgId), eq(facilities.id, id)));
}

/** Soft-archive a facility — never a hard delete (booking history keeps its FK). */
export async function archiveFacility(orgId: string, id: string): Promise<void> {
  await db
    .update(facilities)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(facilities.orgId, orgId), eq(facilities.id, id)));
}
