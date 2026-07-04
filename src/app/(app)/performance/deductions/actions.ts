"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { awardPoints } from "@/lib/points";
import { currentPeriod } from "@/lib/enums";
import { createCoachingIfAbsent } from "@/services/scoring";

export type CaseResult = { ok: true } | { ok: false; error: string };

/** Manager/HR/Boss raises a deduction case (no diamonds move yet). */
export async function createDeductionCase(fd: FormData): Promise<CaseResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const manager = isBoss(s.role) || s.role === "DEPARTMENT_HEAD" || s.role === "HR_ADMIN";
  if (!manager) return { ok: false, error: "Only managers can raise deduction cases." };

  const userId = String(fd.get("userId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  const diamonds = Math.abs(Math.round(Number(fd.get("diamondDeducted") ?? 0) || 0));
  if (!userId || !reason) return { ok: false, error: "Staff and reason are required." };

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true, name: true } });
  if (!target) return { ok: false, error: "Staff not found." };
  // Dept heads can only raise cases for their own team.
  if (s.role === "DEPARTMENT_HEAD" && target.departmentId !== s.departmentId) return { ok: false, error: "You can only raise cases for your own department." };

  const c = await prisma.deductionCase.create({
    data: {
      userId,
      departmentId: target.departmentId,
      category: String(fd.get("category") ?? "TASK_DISCIPLINE"),
      severity: String(fd.get("severity") ?? "MEDIUM"),
      diamondDeducted: diamonds,
      reason,
      evidenceUrl: String(fd.get("evidenceUrl") ?? "") || null,
      createdBy: s.id,
    },
  });
  await logAudit(prisma, { action: "DEDUCTION_CASE_CREATED", entityId: c.id, entityType: "DEDUCTION_CASE", performedBy: s.id, actorName: s.name, affectedUserId: userId, newValue: { reason, diamonds, severity: c.severity } });
  await notify(prisma, { userId, type: "ANNOUNCEMENT", title: "⚠️ Deduction case raised", body: `${reason} (proposed −${diamonds} 💎). You can submit your explanation before it is reviewed.`, link: "/performance/deductions" });
  revalidatePath("/performance/deductions");
  return { ok: true };
}

/** Staff submits their explanation. */
export async function submitExplanation(fd: FormData): Promise<CaseResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const id = String(fd.get("id") ?? "");
  const explanation = String(fd.get("explanation") ?? "").trim();
  if (!explanation) return { ok: false, error: "Write your explanation first." };
  const c = await prisma.deductionCase.findUnique({ where: { id } });
  if (!c || c.userId !== s.id) return { ok: false, error: "Not your case." };
  if (c.status !== "OPEN") return { ok: false, error: "This case is already under review or decided." };
  await prisma.deductionCase.update({ where: { id }, data: { staffExplanation: explanation, status: "EXPLAINED" } });
  await notify(prisma, { userId: c.createdBy, type: "ANNOUNCEMENT", title: "Deduction case explanation submitted", body: `${s.name} responded to the deduction case.`, link: "/performance/deductions" });
  revalidatePath("/performance/deductions");
  return { ok: true };
}

/** Boss/HR decides: approve (diamonds deducted, idempotent) or dismiss. */
export async function decideDeductionCase(fd: FormData): Promise<CaseResult> {
  const s = await getSession();
  if (!s || (!isBoss(s.role) && s.role !== "HR_ADMIN")) return { ok: false, error: "Only Boss / HR can decide deduction cases." };
  const id = String(fd.get("id") ?? "");
  const approve = String(fd.get("decision")) === "approve";
  const finalDecision = String(fd.get("finalDecision") ?? "").trim() || (approve ? "Approved" : "Dismissed");
  const c = await prisma.deductionCase.findUnique({ where: { id } });
  if (!c) return { ok: false, error: "Case not found." };
  if (!["OPEN", "EXPLAINED"].includes(c.status)) return { ok: false, error: "This case is already decided." };

  if (approve) {
    if (c.diamondDeducted > 0) {
      // Idempotency: refuse if this case already produced a deduction.
      const dup = await prisma.pointsTransaction.findFirst({ where: { refType: "DEDUCTION_CASE", refId: c.id } });
      if (!dup) {
        await awardPoints(prisma, {
          userId: c.userId, amount: -c.diamondDeducted, type: "DEDUCTION", transactionType: "DEDUCT",
          sourceType: "DEDUCTION_CASE", reason: `${c.category.replace(/_/g, " ")}: ${c.reason}`,
          refType: "DEDUCTION_CASE", refId: c.id, approvedBy: s.id,
        });
      }
    }
    await prisma.deductionCase.update({ where: { id }, data: { status: "APPROVED", reviewedBy: s.id, finalDecision } });
    await notify(prisma, { userId: c.userId, type: "POINTS_DEDUCTED", title: "Deduction approved", body: `−${c.diamondDeducted} 💎 · ${c.reason}`, link: "/wallet" });

    // Repeated approved cases in 90 days → coaching alert.
    const repeats = await prisma.deductionCase.count({ where: { userId: c.userId, status: "APPROVED", createdAt: { gte: new Date(Date.now() - 90 * 864e5) } } });
    if (repeats >= 3 || c.severity === "RED_LINE") {
      const staff = await prisma.user.findUnique({ where: { id: c.userId }, select: { managerId: true } });
      await createCoachingIfAbsent(c.userId, staff?.managerId ?? s.id, "BEHAVIOUR",
        c.severity === "RED_LINE" ? `Red-line case: ${c.reason}` : `${repeats} approved deduction cases in 90 days — repeated mistakes.`,
        c.severity === "RED_LINE" ? "RED_LINE" : "REPEAT_MISTAKE", currentPeriod());
    }
  } else {
    await prisma.deductionCase.update({ where: { id }, data: { status: "DISMISSED", reviewedBy: s.id, finalDecision } });
    await notify(prisma, { userId: c.userId, type: "ANNOUNCEMENT", title: "Deduction case dismissed", body: finalDecision, link: "/performance/deductions" });
  }
  await logAudit(prisma, { action: approve ? "DEDUCTION_CASE_APPROVED" : "DEDUCTION_CASE_DISMISSED", entityId: id, entityType: "DEDUCTION_CASE", performedBy: s.id, actorName: s.name, affectedUserId: c.userId, newValue: { finalDecision, diamonds: c.diamondDeducted } });
  revalidatePath("/performance/deductions");
  return { ok: true };
}
