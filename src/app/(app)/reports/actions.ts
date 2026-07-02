"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { GRADE_LABEL } from "@/lib/enums";

export interface StaffReportRow {
  name: string; department: string; earned: number; deducted: number;
  grade: string; score: number | null; present: number; late: number; absent: number; leave: number;
}

/** Build the monthly performance rows (staff-level) for a period like "2026-07". */
export async function getMonthlyReport(period: string): Promise<StaffReportRow[]> {
  const s = await getSession();
  if (!s || !(isBoss(s.role) || s.role === "HR_ADMIN")) throw new Error("Forbidden");

  const [users, txns, reviews, attendance] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true }, include: { department: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.pointsTransaction.findMany({ where: { period }, select: { userId: true, amount: true, type: true } }),
    prisma.performanceReview.findMany({ where: { period }, select: { staffId: true, finalGrade: true, totalScore: true } }),
    prisma.attendanceRecord.findMany({ where: { period }, select: { userId: true, status: true } }),
  ]);

  const earned = new Map<string, number>(); const deducted = new Map<string, number>();
  for (const t of txns) {
    if (t.amount > 0) earned.set(t.userId, (earned.get(t.userId) ?? 0) + t.amount);
    else if (t.type !== "REDEMPTION") deducted.set(t.userId, (deducted.get(t.userId) ?? 0) + Math.abs(t.amount));
  }
  const reviewMap = new Map(reviews.map((r) => [r.staffId, r]));
  const att = new Map<string, Record<string, number>>();
  for (const a of attendance) {
    const rec = att.get(a.userId) ?? {};
    rec[a.status] = (rec[a.status] ?? 0) + 1;
    att.set(a.userId, rec);
  }

  return users.map((u) => {
    const r = reviewMap.get(u.id);
    const a = att.get(u.id) ?? {};
    return {
      name: u.name, department: u.department?.name ?? "—",
      earned: earned.get(u.id) ?? 0, deducted: deducted.get(u.id) ?? 0,
      grade: r?.finalGrade ? (GRADE_LABEL[r.finalGrade] ?? r.finalGrade) : "—",
      score: r ? Math.round(r.totalScore) : null,
      present: a.PRESENT ?? 0, late: a.LATE ?? 0, absent: a.ABSENT ?? 0, leave: a.LEAVE ?? 0,
    };
  });
}

/** CSV version of the monthly report for download. */
export async function exportMonthlyReportCsv(period: string): Promise<string> {
  const rows = await getMonthlyReport(period);
  const header = ["Staff", "Department", "DiamondsEarned", "DiamondsDeducted", "Grade", "Score", "Present", "Late", "Absent", "Leave"];
  const csv = [header.join(",")];
  for (const r of rows) {
    csv.push([r.name, r.department, r.earned, r.deducted, r.grade, r.score ?? "", r.present, r.late, r.absent, r.leave].map((c) => `"${c}"`).join(","));
  }
  return csv.join("\n");
}
