"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { computeCommission } from "@/lib/commission";

export type CommResult = { ok: true } | { ok: false; error: string };

/** Boss/Finance (re)computes a salesperson's commission from collected GP. */
export async function recomputeCommission(fd: FormData): Promise<CommResult> {
  const s = await getSession();
  if (!s || (!isBoss(s.role) && s.role !== "FINANCE_ADMIN")) return { ok: false, error: "Only Boss / Finance can compute commission." };
  const userId = String(fd.get("userId") ?? "");
  const period = String(fd.get("period") ?? "");
  const gpTarget = Number(fd.get("gpTarget") ?? 0) || 0;
  if (!userId || !/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: "Staff and month are required." };
  if (gpTarget <= 0) return { ok: false, error: "Set the salesperson's GP target for the month first." };
  await computeCommission(userId, period, gpTarget);
  await logAudit(prisma, { action: "COMMISSION_COMPUTED", entityId: `${userId}:${period}`, entityType: "COMMISSION", performedBy: s.id, actorName: s.name, affectedUserId: userId, newValue: { gpTarget } });
  revalidatePath("/commission");
  return { ok: true };
}

/** Finance confirms the GP figures (eligibility gate before boss approval). */
export async function financeConfirmCommission(id: string): Promise<CommResult> {
  const s = await getSession();
  if (!s || (s.role !== "FINANCE_ADMIN" && !isBoss(s.role))) return { ok: false, error: "Only Finance can confirm GP." };
  const rec = await prisma.commissionRecord.findUnique({ where: { id } });
  if (!rec || rec.status !== "PENDING") return { ok: false, error: "Only pending records can be confirmed." };
  await prisma.commissionRecord.update({ where: { id }, data: { status: "FINANCE_CONFIRMED", financeConfirmedBy: s.id, financeConfirmedAt: new Date() } });
  await logAudit(prisma, { action: "COMMISSION_FINANCE_CONFIRMED", entityId: id, entityType: "COMMISSION", performedBy: s.id, actorName: s.name, affectedUserId: rec.userId });
  revalidatePath("/commission");
  return { ok: true };
}

/** Boss approves (required; ≥150% achievement explicitly needs this step). */
export async function approveCommission(id: string): Promise<CommResult> {
  const s = await getSession();
  if (!s || !isBoss(s.role)) return { ok: false, error: "Only Boss can approve commission." };
  const rec = await prisma.commissionRecord.findUnique({ where: { id } });
  if (!rec) return { ok: false, error: "Record not found." };
  if (rec.status !== "FINANCE_CONFIRMED") return { ok: false, error: "Finance must confirm the GP first." };
  await prisma.commissionRecord.update({ where: { id }, data: { status: "APPROVED", approvedBy: s.id, approvedAt: new Date() } });
  await logAudit(prisma, { action: "COMMISSION_APPROVED", entityId: id, entityType: "COMMISSION", performedBy: s.id, actorName: s.name, affectedUserId: rec.userId, newValue: { amount: rec.amount, tierPct: rec.tierPct } });
  await notify(prisma, { userId: rec.userId, type: "ANNOUNCEMENT", title: "💰 Commission approved", body: `Your ${rec.period} commission (RM ${rec.amount.toLocaleString()}) has been approved.`, link: "/commission" });
  revalidatePath("/commission");
  return { ok: true };
}

/** Finance/Boss holds a commission (uncollected payment, disputed GP...). */
export async function holdCommission(fd: FormData): Promise<CommResult> {
  const s = await getSession();
  if (!s || (s.role !== "FINANCE_ADMIN" && !isBoss(s.role))) return { ok: false, error: "Only Boss / Finance can hold commission." };
  const id = String(fd.get("id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  if (!reason) return { ok: false, error: "A hold reason is required." };
  const rec = await prisma.commissionRecord.findUnique({ where: { id } });
  if (!rec || rec.status === "PAID") return { ok: false, error: "This record cannot be held." };
  await prisma.commissionRecord.update({ where: { id }, data: { status: "HELD", holdReason: reason } });
  await logAudit(prisma, { action: "COMMISSION_HELD", entityId: id, entityType: "COMMISSION", performedBy: s.id, actorName: s.name, affectedUserId: rec.userId, newValue: { reason } });
  await notify(prisma, { userId: rec.userId, type: "ANNOUNCEMENT", title: "Commission on hold", body: `Your ${rec.period} commission is held: ${reason}`, link: "/commission" });
  revalidatePath("/commission");
  return { ok: true };
}

/** Release a held record back to pending recomputation. */
export async function releaseCommission(id: string): Promise<CommResult> {
  const s = await getSession();
  if (!s || (s.role !== "FINANCE_ADMIN" && !isBoss(s.role))) return { ok: false, error: "Only Boss / Finance can release." };
  await prisma.commissionRecord.update({ where: { id }, data: { status: "PENDING", holdReason: null } });
  revalidatePath("/commission");
  return { ok: true };
}
