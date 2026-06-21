/**
 * Member print page — server component.
 * Loads the member's print balance + recent jobs from DB (org-scoped) and
 * passes them as props to the PrintClient (client leaf). The client never
 * supplies orgId/userId or any price (ADR-0004, FR-232, [SEC]).
 * FR-230, FR-231 / AC-0234, AC-0237.
 */
import { requireSession } from "@/lib/auth/session";
import { findById } from "@/lib/db/users";
import { listPrintJobsByUser } from "@/lib/db/print";
import { PrintClient, type PrintJobView } from "./PrintClient";

export default async function PrintPage() {
  const user = await requireSession();
  const [jobs, profile] = await Promise.all([
    listPrintJobsByUser(user.orgId, user.id),
    findById(user.orgId, user.id),
  ]);

  // Map DB rows to the view shape the pixel-identical PrintHistory consumes.
  // PENDING → "WAITING" (Menunggu); READY/COMPLETED → "READY" (Siap Ambil).
  const jobViews: PrintJobView[] = jobs.map((j) => ({
    id: j.id,
    filename: j.fileName,
    pages: j.pages,
    price: j.totalRupiah,
    status: j.status === "PENDING" ? "WAITING" : "READY",
    datetime: j.createdAt.toISOString(),
  }));

  return (
    <PrintClient
      printBalance={profile?.printBalance ?? 0}
      jobs={jobViews}
    />
  );
}
