"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { CS_PROFILE_TYPES, DEFAULT_CASE_CREDITS, PROFILE_RESULT_AREAS } from "@/lib/result-data";

export type CSResult = { ok: true } | { ok: false; error: string };

function canManage(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

/** Assign (or update) a CS role profile for a staff member. */
export async function assignCSProfile(fd: FormData): Promise<CSResult> {
  const s = await getSession();
  if (!s || !canManage(s.role)) return { ok: false, error: "Only Boss / HR can assign CS role profiles." };
  const userId = String(fd.get("userId") ?? "");
  const profileType = String(fd.get("profileType") ?? "");
  if (!userId) return { ok: false, error: "Pick a staff member." };
  if (!CS_PROFILE_TYPES.includes(profileType as (typeof CS_PROFILE_TYPES)[number])) return { ok: false, error: "Pick a valid profile type." };
  const benchmark = Math.max(0, Number(fd.get("monthlyWorkloadBenchmark") ?? 60) || 60);

  await prisma.cSRoleProfile.upsert({
    where: { userId },
    create: { userId, profileType, monthlyWorkloadBenchmark: benchmark, assignedBy: s.id },
    update: { profileType, monthlyWorkloadBenchmark: benchmark, assignedBy: s.id, isActive: true },
  });
  await logAudit(prisma, { action: "CS_PROFILE_ASSIGNED", entityId: userId, entityType: "CS_ROLE_PROFILE", performedBy: s.id, actorName: s.name, affectedUserId: userId, newValue: { profileType, benchmark } });
  revalidatePath("/goals/cs-profiles");
  return { ok: true };
}

export async function removeCSProfile(userId: string): Promise<CSResult> {
  const s = await getSession();
  if (!s || !canManage(s.role)) return { ok: false, error: "Only Boss / HR can remove profiles." };
  await prisma.cSRoleProfile.deleteMany({ where: { userId } });
  revalidatePath("/goals/cs-profiles");
  return { ok: true };
}

/** Edit one case credit weight. */
export async function saveCaseCredit(fd: FormData): Promise<CSResult> {
  const s = await getSession();
  if (!s || !canManage(s.role)) return { ok: false, error: "Only Boss / HR can edit case credits." };
  const workType = String(fd.get("workType") ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const baseCredit = Math.max(0, Number(fd.get("baseCredit") ?? 1) || 1);
  if (!workType) return { ok: false, error: "Work type is required." };
  await prisma.caseCreditSetting.upsert({
    where: { workType },
    create: { workType, baseCredit, description: String(fd.get("description") ?? "") || null },
    update: { baseCredit, description: String(fd.get("description") ?? "") || null },
  });
  revalidatePath("/goals/cs-profiles");
  return { ok: true };
}

/** Seed default case credits + ResultKPI area definitions (idempotent). */
export async function seedResultDefaults(): Promise<CSResult> {
  const s = await getSession();
  if (!s || !canManage(s.role)) return { ok: false, error: "Only Boss / HR can seed defaults." };
  for (const c of DEFAULT_CASE_CREDITS) {
    await prisma.caseCreditSetting.upsert({ where: { workType: c.workType }, create: c, update: {} });
  }
  for (const [profile, areas] of Object.entries(PROFILE_RESULT_AREAS)) {
    for (const a of areas) {
      const exists = await prisma.resultKPI.findFirst({ where: { roleProfile: profile, resultArea: a.area } });
      if (!exists) await prisma.resultKPI.create({ data: { roleProfile: profile, resultArea: a.area, weightage: a.weight } });
    }
  }
  await logAudit(prisma, { action: "RESULT_DEFAULTS_SEEDED", entityId: "defaults", entityType: "RESULT_KPI", performedBy: s.id, actorName: s.name });
  revalidatePath("/goals/cs-profiles");
  return { ok: true };
}

/** Boss/HR record a team head's monthly development RESULT. */
export async function saveTeamHeadResult(fd: FormData): Promise<CSResult> {
  const s = await getSession();
  if (!s || !canManage(s.role)) return { ok: false, error: "Only Boss / HR can record team head results." };
  const teamHeadId = String(fd.get("teamHeadId") ?? "");
  const month = String(fd.get("month") ?? "");
  if (!teamHeadId || !/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Team head and month are required." };
  const data = {
    teamScoreImprovement: Number(fd.get("teamScoreImprovement") ?? 0) || 0,
    repeatedMistakeReduction: Number(fd.get("repeatedMistakeReduction") ?? 0) || 0,
    backupPersonReady: fd.get("backupPersonReady") === "on",
    juniorStaffIndependent: fd.get("juniorStaffIndependent") === "on",
    inquiryBacklogReduction: Number(fd.get("inquiryBacklogReduction") ?? 0) || 0,
    sopImpactResult: String(fd.get("sopImpactResult") ?? "").trim() || null,
    evidenceUrl: String(fd.get("evidenceUrl") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  };
  await prisma.teamHeadDevelopmentResult.upsert({
    where: { teamHeadId_month: { teamHeadId, month } },
    create: { teamHeadId, month, ...data },
    update: data,
  });
  await logAudit(prisma, { action: "TEAM_HEAD_RESULT_SAVED", entityId: teamHeadId, entityType: "TEAM_HEAD_RESULT", performedBy: s.id, actorName: s.name, affectedUserId: teamHeadId, newValue: { month, ...data } });
  revalidatePath("/goals/cs-profiles");
  return { ok: true };
}
