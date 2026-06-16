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
import type { DrinkTemperature, SugarLevel } from "@/lib/db/enums";

/** Format temperature + sugar enum values into a display string. */
function formatVariant(
  temp: DrinkTemperature | null,
  sugar: SugarLevel | null,
): string | undefined {
  const parts: string[] = [];
  if (temp) {
    const tempLabel: Record<DrinkTemperature, string> = {
      HOT: "Hot",
      COLD: "Cold",
      ICE_BLENDED: "Ice Blended",
    };
    parts.push(tempLabel[temp]);
  }
  if (sugar) {
    const sugarLabel: Record<SugarLevel, string> = {
      NORMAL: "Normal Sugar",
      LESS: "Less Sugar",
      NONE: "No Sugar",
    };
    parts.push(sugarLabel[sugar]);
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
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
        variant: formatVariant(item.temperature, item.sugar),
      }));

      const view: BaristaOrderView = {
        id: o.id,
        code: `#${o.code}`,
        customer,
        status: kdsStatus,
        placedAt: o.createdAt.toISOString(),
        lines,
      };
      return view;
    })
    .filter((o): o is BaristaOrderView => o !== null);

  return <BaristaClient initialOrders={orders} orgId={user.orgId} />;
}
