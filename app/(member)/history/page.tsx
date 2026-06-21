/**
 * Member history — server component.
 * Reads the member's bookings + transactions (org+user scoped from the session,
 * never client ids) and passes them to the pixel-identical HistoryClient leaf.
 * [SEC] all reads org+user scoped.
 */
import { requireSession } from "@/lib/auth/session";
import { listBookingsByUser } from "@/lib/db/bookings";
import { listTransactionsByUser } from "@/lib/db/transactions";
import {
  HistoryClient,
  type BookingHistoryView,
  type TransactionHistoryView,
  type TransactionKindView,
} from "./HistoryClient";
import type { TransactionType } from "@/lib/db/enums";

/** Map the ledger TransactionType enum → the display kind the leaf consumes. */
function kindOf(type: TransactionType): TransactionKindView {
  switch (type) {
    case "CAFE_ORDER":
      return "cafe";
    case "PRINT_JOB":
    case "PRINT_TOPUP":
      return "print";
    case "PACKAGE_PURCHASE":
      return "package";
    case "BOOKING":
    default:
      return "booking";
  }
}

export default async function HistoryPage() {
  const user = await requireSession();
  const [bookingRows, txnRows] = await Promise.all([
    listBookingsByUser(user.orgId, user.id),
    listTransactionsByUser(user.orgId, user.id),
  ]);

  const bookings: BookingHistoryView[] = bookingRows.map((b) => ({
    id: b.id,
    facility: b.facilityName,
    start: b.startAt.toISOString(),
    // walk-in ACTIVE: endAt/durationHours are null (charged at checkout) — the
    // leaf degrades gracefully (date-only + "—"). [SEC] no client ids.
    end: b.endAt ? b.endAt.toISOString() : null,
    durationHours: b.durationHours,
    status: b.status,
    payment: b.paymentStatus,
  }));

  const transactions: TransactionHistoryView[] = txnRows.map((t) => ({
    id: t.id,
    kind: kindOf(t.type),
    description: t.description,
    amount: t.amountRupiah,
    datetime: t.createdAt.toISOString(),
    status: t.status,
  }));

  return <HistoryClient bookings={bookings} transactions={transactions} />;
}
