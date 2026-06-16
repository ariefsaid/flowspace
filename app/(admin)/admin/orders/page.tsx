/**
 * Admin orders page — server component.
 * Lists all org-scoped orders from DB (newest first).
 * Maps DB CafeOrder → AdminOrderView for the client component.
 * FR-124, FR-130 / AC-101
 */
import { requireSession } from "@/lib/auth/session";
import { listOrders } from "@/lib/db/cafe";
import { OrdersClient } from "./OrdersClient";
import type { AdminOrderView, AdminOrderItemView } from "./OrdersClient";
import type { DrinkTemperature, SugarLevel } from "@prisma/client";

function formatVariant(
  temp: DrinkTemperature | null,
  sugar: SugarLevel | null,
): string | undefined {
  const parts: string[] = [];
  if (temp) {
    const t: Record<DrinkTemperature, string> = {
      HOT: "Hot",
      COLD: "Cold",
      ICE_BLENDED: "Ice Blended",
    };
    parts.push(t[temp]);
  }
  if (sugar) {
    const s: Record<SugarLevel, string> = {
      NORMAL: "Normal Sugar",
      LESS: "Less Sugar",
      NONE: "No Sugar",
    };
    parts.push(s[sugar]);
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export default async function AdminOrdersPage() {
  const user = await requireSession();
  const dbOrders = await listOrders(user.orgId);

  const orders: AdminOrderView[] = dbOrders.map((o) => {
    const items: AdminOrderItemView[] = o.items.map((item) => ({
      nameSnapshot: item.nameSnapshot,
      qty: item.qty,
      unitPriceRupiah: item.unitPriceRupiah,
      variant: formatVariant(item.temperature, item.sugar),
    }));

    return {
      id: o.id,
      code: `#${o.code}`,
      // customer: resolved via member join; for now use guestName / undefined
      customer: undefined,
      email: undefined,
      guestName: o.guestName ?? undefined,
      placedAt: o.createdAt.toISOString(),
      status: o.status,
      subtotalRupiah: o.subtotalRupiah,
      discountRupiah: o.discountRupiah,
      totalRupiah: o.totalRupiah,
      items,
    };
  });

  return <OrdersClient initialOrders={orders} />;
}
