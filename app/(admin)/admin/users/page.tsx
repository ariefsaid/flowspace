/**
 * Admin user-management page — server component.
 * Reads the org-scoped member directory from DB and maps AppUser → AdminUserView
 * for the client leaf. Edit/Add remain non-wired stubs (ponytail — deferred).
 *
 * ponytail: phone is not on app_users (renders as "" → omitted by the existing
 * conditional UI); per-user booking/transaction counts are 0 until aggregate
 * reads are a separate concern.
 */
import { requireSession } from "@/lib/auth/session";
import { listByOrg } from "@/lib/db/users";
import { UsersClient, type AdminUserView } from "./UsersClient";

export default async function AdminUsersPage() {
  const user = await requireSession();
  const rows = await listByOrg(user.orgId);

  const users: AdminUserView[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: "", // not on app_users today
    tier: u.membershipTier,
    joinedAt: u.createdAt.toISOString(),
    bookings: 0, // per-user aggregates deferred
    transactions: 0,
  }));

  return <UsersClient users={users} />;
}
