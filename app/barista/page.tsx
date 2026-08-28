/**
 * Barista KDS page — server component.
 * Reads live orders from DB (NEW/PREPARING/READY statuses, org-scoped).
 * Maps DB CafeOrder → BaristaOrderView for the client component.
 * FR-130 / AC-101 / supports AC-121
 */
import { requireSession } from "@/lib/auth/session";
import { listOrders } from "@/lib/db/cafe";
import { BaristaClient } from "./BaristaClient";
import type { BaristaOrderView, BaristaOrderLineView } from "./BaristaClient";
import type { VariantOptionSnapshot } from "@/lib/cafe/types";

/** Formats the canonical option snapshots into "Group: Option, Group: Option" (I-044, FR-728). */
function formatVariantOptions(options: VariantOptionSnapshot[]): string | undefined {
  if (!options.length) return undefined;
  return options.map((o) => `${o.variantName}: ${o.optionName}`).join(", ");
}

/** Map DB CafeOrderStatus enum (uppercase) to KDS status (lowercase). */
function toKdsStatus(status: string): "new" | "preparing" | "ready" | null {
  if (status === "NEW") return "new";
  if (status === "PREPARING") return "preparing";
  if (status === "READY") return "ready";
  return null;
}

export default async function BaristaPage() {
  const user = await requireSession();
  const dbOrders = await listOrders(user.orgId, {
    statuses: ["NEW", "PREPARING", "READY"],
  });

  const orders: BaristaOrderView[] = dbOrders
    .map((o) => {
      const kdsStatus = toKdsStatus(o.status);
      if (!kdsStatus) return null;

      const customer = o.guestName
        ? `Guest: ${o.guestName}`
        : "Member";

      const lines: BaristaOrderLineView[] = o.items.map((item) => ({
        name: item.nameSnapshot,
        qty: item.qty,
        variant: formatVariantOptions(item.variantOptions),
      }));

      const view: BaristaOrderView = {
        id: o.id,
        code: `#${o.code}`,
        customer,
        status: kdsStatus,
        placedAt: o.createdAt.toISOString(),
        notes: o.notes,
        lines,
      };
      return view;
    })
    .filter((o): o is BaristaOrderView => o !== null);

  return <BaristaClient initialOrders={orders} orgId={user.orgId} />;
}
