"use server";
/**
 * Printer admin actions (I-043, spec 0009). [SEC]
 *
 * The ADMIN role is re-checked IN the action body — never only in
 * middleware/layout (defense against a misrouted invocation). The org scope
 * comes exclusively from the session; clients never submit an orgId.
 * Every mutation revalidates the printers page.
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import {
  createPrinter,
  updatePrinter,
  archivePrinter,
  setDefaultPrinter,
  type CreatePrinterInput,
  type UpdatePrinterInput,
} from "@/lib/db/printers";

export async function createPrinterAction(input: CreatePrinterInput): Promise<void> {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  await createPrinter(user.orgId, input);
  revalidatePath("/admin/settings/printers");
}

export async function updatePrinterAction(
  input: { id: string } & UpdatePrinterInput,
): Promise<void> {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  const { id, ...patch } = input;
  await updatePrinter(user.orgId, id, patch);
  revalidatePath("/admin/settings/printers");
}

export async function archivePrinterAction(id: string): Promise<void> {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  await archivePrinter(user.orgId, id);
  revalidatePath("/admin/settings/printers");
}

export async function setDefaultPrinterAction(id: string): Promise<void> {
  const user = await requireSession();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  await setDefaultPrinter(user.orgId, id);
  revalidatePath("/admin/settings/printers");
}
