"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { reverseDiamondTransaction, voidDiamondTransaction, exportDiamondReport, type TxnFilter } from "@/lib/diamonds";

async function requireOwner() {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Owner can perform this action.");
  return s;
}

export async function reverseTxn(txId: string) {
  const s = await requireOwner();
  await reverseDiamondTransaction(txId, s.id);
  revalidatePath("/diamonds/transactions");
  revalidatePath("/owner/diamonds");
}

export async function voidTxn(txId: string) {
  const s = await requireOwner();
  await voidDiamondTransaction(txId, s.id);
  revalidatePath("/diamonds/transactions");
  revalidatePath("/owner/diamonds");
}

/** Return a CSV string for the current filter (Owner: all; scoped for others). */
export async function exportDiamondCsv(filter: TxnFilter): Promise<string> {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  return exportDiamondReport(filter, { id: s.id, role: s.role, departmentId: s.departmentId });
}
