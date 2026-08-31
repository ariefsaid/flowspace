/**
 * Admin facility catalog — "Kelola Fasilitas" (I-042). RSC: loads the org's
 * non-archived facilities, renders the editor. ADMIN-only is enforced by
 * middleware + the (admin) layout guard.
 */
import { requireSession } from "@/lib/auth/session";
import { listFacilitiesForAdmin } from "@/lib/db/facilities-admin";
import { FacilitiesClient } from "./FacilitiesClient";

export default async function AdminFacilitiesPage() {
  const { orgId } = await requireSession();
  const facilities = await listFacilitiesForAdmin(orgId);
  return <FacilitiesClient facilities={facilities} />;
}
