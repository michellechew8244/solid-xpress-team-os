"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export type RuleResult = { ok: true } | { ok: false; error: string };

/** Boss creates/updates a deduction rule (PenaltyRule + category/severity). */
export async function saveDeductionRule(fd: FormData): Promise<RuleResult> {
  const s = await getSession();
  if (!s || !isBoss(s.role)) return { ok: false, error: "Only Boss / Management can edit deduction rules." };
  const id = String(fd.get("id") ?? "");
  const data = {
    name: String(fd.get("name") ?? "").trim(),
    category: String(fd.get("category") ?? "TASK_DISCIPLINE"),
    severity: String(fd.get("severity") ?? "MEDIUM"),
    departmentId: String(fd.get("departmentId") ?? "") || null,
    deductionPoints: Math.abs(Math.round(Number(fd.get("deductionPoints") ?? 0) || 0)),
    description: String(fd.get("description") ?? "") || null,
    coachingTrigger: fd.get("coachingTrigger") === "on",
    isRedLine: String(fd.get("severity")) === "RED_LINE",
    isActive: fd.get("isActive") !== "off",
  };
  if (!data.name) return { ok: false, error: "Rule name is required." };
  if (id) await prisma.penaltyRule.update({ where: { id }, data });
  else await prisma.penaltyRule.create({ data });
  await logAudit(prisma, { action: "DEDUCTION_RULE_SAVED", entityId: id || data.name, entityType: "PENALTY_RULE", performedBy: s.id, actorName: s.name, newValue: data });
  revalidatePath("/performance/deduction-rules");
  return { ok: true };
}

export async function deleteDeductionRule(id: string): Promise<RuleResult> {
  const s = await getSession();
  if (!s || !isBoss(s.role)) return { ok: false, error: "Only Boss / Management can delete rules." };
  await prisma.penaltyRule.delete({ where: { id } });
  await logAudit(prisma, { action: "DEDUCTION_RULE_DELETED", entityId: id, entityType: "PENALTY_RULE", performedBy: s.id, actorName: s.name });
  revalidatePath("/performance/deduction-rules");
  return { ok: true };
}

/** Seed the universal deduction rules from the management spec (idempotent). */
export async function seedUniversalRules(): Promise<RuleResult> {
  const s = await getSession();
  if (!s || !isBoss(s.role)) return { ok: false, error: "Only Boss / Management can seed rules." };
  const rules = [
    { name: "Late without approved reason", category: "ATTENDANCE", severity: "LOW", deductionPoints: 5 },
    { name: "Missing check-out", category: "ATTENDANCE", severity: "LOW", deductionPoints: 10 },
    { name: "Daily report not submitted", category: "TASK_DISCIPLINE", severity: "LOW", deductionPoints: 5 },
    { name: "Task overdue with explanation", category: "TASK_DISCIPLINE", severity: "LOW", deductionPoints: 5 },
    { name: "Task overdue without explanation", category: "TASK_DISCIPLINE", severity: "MEDIUM", deductionPoints: 15 },
    { name: "No proof uploaded", category: "TASK_DISCIPLINE", severity: "LOW", deductionPoints: 10 },
    { name: "Customer update missed", category: "CUSTOMER_SERVICE", severity: "MEDIUM", deductionPoints: 20 },
    { name: "Handover unclear", category: "HANDOVER_MISTAKE", severity: "MEDIUM", deductionPoints: 20 },
    { name: "Wrong data entry", category: "DOCUMENTATION_MISTAKE", severity: "MEDIUM", deductionPoints: 30 },
    { name: "Same mistake repeated", category: "TASK_DISCIPLINE", severity: "HIGH", deductionPoints: 50, coachingTrigger: true },
    { name: "Customer complaint due to negligence", category: "CUSTOMER_SERVICE", severity: "HIGH", deductionPoints: 80, coachingTrigger: true },
    { name: "Short billing caused by negligence", category: "FINANCE_MISTAKE", severity: "CRITICAL", deductionPoints: 150, coachingTrigger: true },
    { name: "Additional cost caused by negligence", category: "OPERATION_MISTAKE", severity: "CRITICAL", deductionPoints: 100, coachingTrigger: true },
    { name: "Customs / permit penalty caused by negligence", category: "FORWARDING_MISTAKE", severity: "CRITICAL", deductionPoints: 200, coachingTrigger: true },
    { name: "Hidden issue not reported", category: "INTEGRITY", severity: "CRITICAL", deductionPoints: 150, coachingTrigger: true },
    { name: "Integrity issue (red line)", category: "INTEGRITY", severity: "RED_LINE", deductionPoints: 0, coachingTrigger: true, isRedLine: true },
  ];
  for (const r of rules) {
    const exists = await prisma.penaltyRule.findFirst({ where: { name: r.name } });
    if (!exists) await prisma.penaltyRule.create({ data: r });
  }
  await logAudit(prisma, { action: "DEDUCTION_RULES_SEEDED", entityId: "universal", entityType: "PENALTY_RULE", performedBy: s.id, actorName: s.name });
  revalidatePath("/performance/deduction-rules");
  return { ok: true };
}
