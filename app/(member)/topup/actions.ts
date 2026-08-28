"use server";
import { requireSession } from "@/lib/auth/session";
import { purchasePackage } from "@/lib/db/packages";
import { purchasePrintTopup } from "@/lib/db/print-packages";

export async function purchasePackageAction(packageId: string) {
  const user = await requireSession();
  return purchasePackage({ orgId: user.orgId, userId: user.id, packageId });
}

export async function topUpPrintAction(packageId: string) {
  const user = await requireSession();
  return purchasePrintTopup({ orgId: user.orgId, userId: user.id, packageId });
}
