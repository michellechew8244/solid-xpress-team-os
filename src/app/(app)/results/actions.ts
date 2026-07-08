"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { awardPoints } from "@/lib/points";
import { currentPeriod } from "@/lib/enums";
import { RESULT_TYPES, profileForUser } from "@/lib/result-kpi";

export type ResResult = { ok: true } | { ok: false; error: string };

function manager(role: string) {
  return isBoss(role) || role === "DEPARTMENT_HEAD" || role === "HR_ADMIN";
}

/** Staff (or managers) log an achieved result. Manager approval scores it. */
export async function logResult(fd: FormData): Promise<ResResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const forUserId = String(fd.get("userId") ?? "") || s.id;
  if (forUserId !== s.id && !manager(s.role)) return { ok: false, error: "You can only log your own results." };

  const resultType = String(fd.get("resultType") ?? "");
  const preset = RESULT_TYPES.find((t) => t.key === resultType);
  if (!preset) return { ok: false, error: "Pick the result type." };

  const target = await prisma.user.findUnique({ where: { id: forUserId }, select: { departmentId: true } });
  const roleProfile = await profileForUser(forUserId);

  await prisma.resultRecord.create({
    data: {
      userId: forUserId,
      departmentId: target?.departmentId ?? null,
      roleProfile,
      resultType,
      resultArea: preset.area,
      period: /^\d{4}-\d{2}$/.test(String(fd.get("period"))) ? String(fd.get("period")) : currentPeriod(),
      relatedJobNo: String(fd.get("relatedJobNo") ?? "").trim() || null,
      relatedCustomer: String(fd.get("relatedCustomer") ?? "").trim() || null,
      businessImpact: String(fd.get("businessImpact") ?? "").trim() || null,
      evidenceUrl: String(fd.get("evidenceUrl") ?? "").trim() || null,
    },
  });
  // Alert the reviewer chain.
  const staff = await prisma.user.findUnique({ where: { id: forUserId }, select: { name: true, managerId: true } });
  if (staff?.managerId && staff.managerId !== s.id) {
    await notify(prisma, { userId: staff.managerId, type: "ANNOUNCEMENT", title: "🎯 Result awaiting review", body: `${staff.name}: ${preset.label}`, link: "/results" });
  }
  revalidatePath("/results");
  return { ok: true };
}

/** Manager approves with a quality gate % (and result-based diamonds) or rejects. */
export async function reviewResult(fd: FormData): Promise<ResResult> {
  const s = await getSession();
  if (!s || !manager(s.role)) return { ok: false, error: "Only managers can review results." };
  const id = String(fd.get("id") ?? "");
  const approve = String(fd.get("decision")) === "approve";
  const rec = await prisma.resultRecord.findUnique({ where: { id } });
  if (!rec) return { ok: false, error: "Record not found." };
  if (rec.resultStatus !== "SUBMITTED") return { ok: false, error: "Already reviewed." };
  if (rec.userId === s.id && !isBoss(s.role)) return { ok: false, error: "You cannot approve your own result — ask your manager." };
  if (s.role === "DEPARTMENT_HEAD") {
    const staff = await prisma.user.findUnique({ where: { id: rec.userId }, select: { departmentId: true } });
    if (staff?.departmentId !== s.departmentId) return { ok: false, error: "Not in your department." };
  }

  if (!approve) {
    await prisma.resultRecord.update({ where: { id }, data: { resultStatus: "REJECTED", approvedBy: s.id } });
    await notify(prisma, { userId: rec.userId, type: "ANNOUNCEMENT", title: "Result not accepted", body: String(fd.get("note") ?? "Check with your manager."), link: "/results" });
    revalidatePath("/results");
    return { ok: true };
  }

  const qualityGate = Math.max(0, Math.min(100, Number(fd.get("qualityGatePercent") ?? 100) || 100));
  const resultValue = Math.max(0, Math.min(120, Number(fd.get("resultValue") ?? 100) || 100));
  const finalScore = Math.round((resultValue * qualityGate) / 100);
  const diamonds = Math.max(0, Math.min(1000, Math.round(Number(fd.get("diamonds") ?? 0) || 0)));

  await prisma.resultRecord.update({
    where: { id },
    data: { resultStatus: "APPROVED", qualityGatePercent: qualityGate, resultValue, finalResultScore: finalScore, diamondsAwarded: diamonds, approvedBy: s.id },
  });

  // Result-based diamonds (idempotent by record id).
  if (diamonds > 0) {
    const dup = await prisma.pointsTransaction.findFirst({ where: { refType: "RESULT_RECORD", refId: id } });
    if (!dup) {
      const preset = RESULT_TYPES.find((t) => t.key === rec.resultType);
      await awardPoints(prisma, {
        userId: rec.userId, amount: diamonds, type: "BONUS", transactionType: "EARN", sourceType: "RESULT_REWARD",
        reason: `Result: ${preset?.label ?? rec.resultType}${rec.relatedJobNo ? ` (${rec.relatedJobNo})` : ""}`,
        refType: "RESULT_RECORD", refId: id, approvedBy: s.id,
      });
    }
  }
  await logAudit(prisma, { action: "RESULT_APPROVED", entityId: id, entityType: "RESULT_RECORD", performedBy: s.id, actorName: s.name, affectedUserId: rec.userId, newValue: { resultType: rec.resultType, qualityGate, finalScore, diamonds } });
  await notify(prisma, { userId: rec.userId, type: "ANNOUNCEMENT", title: `✅ Result approved (${qualityGate}% quality gate)`, body: `Score ${finalScore}${diamonds ? ` · +${diamonds} 💎` : ""}`, link: "/results" });
  revalidatePath("/results");
  return { ok: true };
}
