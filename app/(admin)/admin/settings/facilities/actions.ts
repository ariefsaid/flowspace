"use server";
/**
 * Admin facility-catalog actions (I-042). [SEC] money-adjacent —
 * `ratePerHourRupiah` feeds booking pricing. ADMIN-only; `orgId` comes from
 * the server-derived session (never the client). The repo validates and
 * rejects invalid input with no write (INVALID_RATE/INVALID_CAPACITY/
 * INVALID_MAX_HOURS_CAP) — these actions forward the rejection unmodified so
 * the client can surface it as an inline field error.
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import {
  createFacility,
  updateFacility,
  archiveFacility,
  type FacilityInput,
  type FacilityUpdateInput,
} from "@/lib/db/facilities-admin";
import type { Facility } from "@/lib/db/schema";

async function requireAdmin() {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function createFacilityAction(input: FacilityInput): Promise<Facility> {
  const user = await requireAdmin();
  const facility = await createFacility(user.orgId, input);
  revalidatePath("/admin/settings/facilities");
  return facility;
}

export async function updateFacilityAction(id: string, input: FacilityUpdateInput): Promise<void> {
  const user = await requireAdmin();
  await updateFacility(user.orgId, id, input);
  revalidatePath("/admin/settings/facilities");
}

export async function archiveFacilityAction(id: string): Promise<void> {
  const user = await requireAdmin();
  await archiveFacility(user.orgId, id);
  revalidatePath("/admin/settings/facilities");
}
