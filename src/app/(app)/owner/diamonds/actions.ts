"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import {
  generateDiamondsByOwner, generateDiamondsForDepartment, generateDiamondsForAllStaff,
  generateDiamondsForSelected, adjustDiamondBalance, setOwnerDiamondAuthority,
} from "@/lib/diamonds";

/** Require diamond-generation authority: Owner/Boss, or a user the Owner has granted. */
async function requireDiamondAuthority() {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  if (isBoss(s.role)) return s;
  const u = await prisma.user.findUnique({ where: { id: s.id }, select: { hasOwnerDiamondAuthority: true } });
  if (!u?.hasOwnerDiamondAuthority) throw new Error("You do not have authority to generate diamonds.");
  return s;
}

function common(formData: FormData) {
  const amount = Math.round(Number(formData.get("amount") ?? 0));
  const reason = String(formData.get("reason") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "OWNER_BONUS");
  const effectiveDate = formData.get("effectiveDate") ? new Date(String(formData.get("effectiveDate"))) : undefined;
  const notifyStaff = formData.get("notifyStaff") === "on" || formData.get("notifyStaff") === "true";
  const internalNote = String(formData.get("internalNote") ?? "").trim() || undefined;
  const ownerOverride = formData.get("ownerOverride") === "on" || formData.get("ownerOverride") === "true";
  return { amount, reason, sourceType, effectiveDate, notifyStaff, internalNote, ownerOverride };
}

export interface GenerateResult { count: number; amount: number; recipient: string }

export async function generateDiamonds(formData: FormData): Promise<GenerateResult> {
  const me = await requireDiamondAuthority();
  const base = common(formData);
  const recipientType = String(formData.get("recipientType") ?? "INDIVIDUAL");

  if (recipientType === "INDIVIDUAL") {
    const targetUserId = String(formData.get("staffId") ?? "");
    if (!targetUserId) throw new Error("Select a staff member.");
    await generateDiamondsByOwner({ targetUserId, generatedBy: me.id, ...base });
    const u = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true } });
    return { count: 1, amount: base.amount, recipient: u?.name ?? "staff" };
  }
  if (recipientType === "DEPARTMENT") {
    const departmentId = String(formData.get("departmentId") ?? "");
    if (!departmentId) throw new Error("Select a department.");
    const r = await generateDiamondsForDepartment({ departmentId, generatedBy: me.id, ...base });
    const d = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } });
    return { count: r.count, amount: base.amount, recipient: `${d?.name ?? "department"} (${r.count} staff)` };
  }
  if (recipientType === "ALL") {
    const r = await generateDiamondsForAllStaff({ generatedBy: me.id, ...base });
    return { count: r.count, amount: base.amount, recipient: `all staff (${r.count})` };
  }
  if (recipientType === "SELECTED") {
    const ids = String(formData.get("selectedIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) throw new Error("Select at least one staff member.");
    const r = await generateDiamondsForSelected(ids, { generatedBy: me.id, ...base });
    return { count: r.count, amount: base.amount, recipient: `${r.count} selected staff` };
  }
  throw new Error("Invalid recipient type.");
}

export async function adjustBalance(formData: FormData) {
  const me = await requireDiamondAuthority();
  const userId = String(formData.get("userId") ?? "");
  const adjustmentType = String(formData.get("adjustmentType") ?? "ADD") as "ADD" | "DEDUCT";
  const amount = Math.round(Number(formData.get("amount") ?? 0));
  const reason = String(formData.get("reason") ?? "").trim();
  const internalNote = String(formData.get("internalNote") ?? "").trim() || undefined;
  const relatedTransactionId = String(formData.get("relatedTransactionId") ?? "").trim() || undefined;
  const ownerOverride = formData.get("ownerOverride") === "on" || formData.get("ownerOverride") === "true";
  if (!userId) throw new Error("Select a staff member.");
  await adjustDiamondBalance({ userId, adjustmentType, amount, reason, internalNote, relatedTransactionId, ownerOverride, generatedBy: me.id });
  revalidatePath("/owner/diamonds");
  revalidatePath("/diamonds/transactions");
}

/** Grant/remove another user's diamond-generation authority (Owner/Boss only). */
export async function grantDiamondAuthority(targetUserId: string, grant: boolean) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Owner can change diamond authority.");
  await setOwnerDiamondAuthority(targetUserId, grant, s.id);
  revalidatePath("/settings/diamond-authority");
}
