"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import {
  generateCompanyPerformanceAnalysis, generateDepartmentPerformanceAnalysis,
  generateStaffPerformanceAnalysis, generateCoachingSuggestion,
  generateMonthlyBossReport, detectPerformanceRisk, generateKPISettingAdvice, generateResultsAnalysis,
} from "@/lib/ai-coach";
import { currentPeriod } from "@/lib/enums";

export type AIResult = { ok: true; text: string } | { ok: false; error: string };

export async function runAnalysis(fd: FormData): Promise<AIResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const type = String(fd.get("type") ?? "");
  const month = /^\d{4}-\d{2}$/.test(String(fd.get("month"))) ? String(fd.get("month")) : currentPeriod();
  const targetId = String(fd.get("targetId") ?? "");
  const boss = isBoss(s.role);
  const head = s.role === "DEPARTMENT_HEAD";

  try {
    switch (type) {
      case "COMPANY":
        if (!boss) return { ok: false, error: "Company analysis is for Boss / Management." };
        return { ok: true, text: await generateCompanyPerformanceAnalysis(month, s.id) };
      case "BOSS_MONTHLY":
        if (!boss) return { ok: false, error: "The monthly boss report is for Boss / Management." };
        return { ok: true, text: await generateMonthlyBossReport(month, s.id) };
      case "RESULTS":
        if (!boss && s.role !== "HR_ADMIN" && !head) return { ok: false, error: "Results analysis is for managers." };
        return { ok: true, text: await generateResultsAnalysis(month, s.id) };
      case "RISK":
        if (!boss && s.role !== "FINANCE_ADMIN") return { ok: false, error: "Risk detection is for Boss / Finance." };
        return { ok: true, text: await detectPerformanceRisk(month, s.id) };
      case "KPI_ADVICE": {
        const deptId = targetId || s.departmentId || "";
        if (!boss && !(head && deptId === s.departmentId) && s.role !== "HR_ADMIN") return { ok: false, error: "You can only get KPI advice for your own department." };
        if (!deptId) return { ok: false, error: "Pick a department." };
        return { ok: true, text: await generateKPISettingAdvice(deptId, month, s.id) };
      }
      case "DEPARTMENT": {
        const deptId = targetId || s.departmentId || "";
        if (!boss && !(head && deptId === s.departmentId) && s.role !== "HR_ADMIN") return { ok: false, error: "You can only analyse your own department." };
        if (!deptId) return { ok: false, error: "Pick a department." };
        return { ok: true, text: await generateDepartmentPerformanceAnalysis(deptId, month, s.id) };
      }
      case "STAFF": {
        const userId = targetId || s.id;
        if (userId !== s.id && !boss && !head && s.role !== "HR_ADMIN") return { ok: false, error: "You can only analyse your own performance." };
        if (userId !== s.id && head) {
          const target = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
          if (target?.departmentId !== s.departmentId) return { ok: false, error: "That staff member is not in your department." };
        }
        return { ok: true, text: await generateStaffPerformanceAnalysis(userId, month, s.id) };
      }
      case "COACHING": {
        if (!boss && !head && s.role !== "HR_ADMIN") return { ok: false, error: "Coaching drafts are for managers." };
        if (!targetId) return { ok: false, error: "Pick a staff member." };
        return { ok: true, text: await generateCoachingSuggestion(targetId, month, s.id) };
      }
      default:
        return { ok: false, error: "Unknown analysis type." };
    }
  } catch (e) {
    console.error("runAnalysis:", e);
    return { ok: false, error: "Analysis failed — please try again." };
  }
}
