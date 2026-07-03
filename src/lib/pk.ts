import { prisma } from "./prisma";

/**
 * PK Arena — standings are computed LIVE from real records for the campaign
 * window (no participant rows to maintain, nothing to game). Fairness: only
 * active staff are ranked; staff with an open red-line case are shown but
 * flagged ineligible and skipped at payout unless the Boss overrides.
 */

export const PK_METRICS: Record<string, string> = {
  DIAMONDS: "💎 Diamonds earned",
  KPI_SCORE: "📈 Avg KPI achievement",
  ATTENDANCE: "⏰ On-time days",
  PROPOSALS: "💡 Accepted proposals",
  BADGES: "🏅 Badges earned",
  TASK_COMPLETION: "✅ Tasks completed",
};

export interface Standing {
  userId: string;
  name: string;
  avatarColor: string;
  departmentId: string | null;
  departmentName: string;
  score: number;
  eligible: boolean;
}

/** Per-user metric totals within [from, to]. */
async function metricByUser(metricType: string, from: Date, to: Date): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const dateKey = (d: Date) => d.toISOString().slice(0, 10);

  if (metricType === "DIAMONDS") {
    const rows = await prisma.pointsTransaction.groupBy({ by: ["userId"], where: { amount: { gt: 0 }, createdAt: { gte: from, lte: to } }, _sum: { amount: true } });
    for (const r of rows) map.set(r.userId, r._sum.amount ?? 0);
  } else if (metricType === "KPI_SCORE") {
    const rows = await prisma.kPIResult.groupBy({ by: ["userId"], where: { updatedAt: { gte: from, lte: to } }, _avg: { achievementPct: true } });
    for (const r of rows) map.set(r.userId, Math.round(r._avg.achievementPct ?? 0));
  } else if (metricType === "ATTENDANCE") {
    const rows = await prisma.attendanceRecord.groupBy({
      by: ["userId"],
      where: { date: { gte: dateKey(from), lte: dateKey(to) }, clockIn: { not: null }, lateMinutes: 0, status: { notIn: ["MISSING_CHECK_OUT", "ABSENT"] } },
      _count: true,
    });
    for (const r of rows) map.set(r.userId, r._count);
  } else if (metricType === "PROPOSALS") {
    const rows = await prisma.proposal.groupBy({ by: ["submittedById"], where: { status: { in: ["ACCEPTED", "IMPLEMENTED"] }, acceptedAt: { gte: from, lte: to } }, _count: true });
    for (const r of rows) map.set(r.submittedById, r._count);
  } else if (metricType === "BADGES") {
    const rows = await prisma.userBadge.groupBy({ by: ["userId"], where: { awardedAt: { gte: from, lte: to } }, _count: true });
    for (const r of rows) map.set(r.userId, r._count);
  } else if (metricType === "TASK_COMPLETION") {
    const rows = await prisma.task.groupBy({ by: ["assigneeId"], where: { status: "COMPLETED", updatedAt: { gte: from, lte: to } }, _count: true });
    for (const r of rows) if (r.assigneeId) map.set(r.assigneeId, r._count);
  }
  return map;
}

/** Individual standings for a campaign window, best score first. */
export async function individualStandings(metricType: string, from: Date, to: Date): Promise<Standing[]> {
  const [scores, users, redLines] = await Promise.all([
    metricByUser(metricType, from, to),
    prisma.user.findMany({
      where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true },
      select: { id: true, name: true, avatarColor: true, departmentId: true, department: { select: { name: true } } },
    }),
    prisma.coachingRecord.findMany({ where: { triggeredBy: "RED_LINE", status: { not: "RESOLVED" } }, select: { staffId: true } }),
  ]);
  const flagged = new Set(redLines.map((r) => r.staffId));
  return users
    .map((u) => ({
      userId: u.id, name: u.name, avatarColor: u.avatarColor, departmentId: u.departmentId,
      departmentName: u.department?.name ?? "—", score: scores.get(u.id) ?? 0, eligible: !flagged.has(u.id),
    }))
    .sort((a, b) => b.score - a.score);
}

/** Department standings: sum of member scores (avg for KPI_SCORE). */
export async function departmentStandings(metricType: string, from: Date, to: Date) {
  const standings = await individualStandings(metricType, from, to);
  const byDept = new Map<string, { departmentId: string; name: string; total: number; members: number }>();
  for (const s of standings) {
    if (!s.departmentId) continue;
    const d = byDept.get(s.departmentId) ?? { departmentId: s.departmentId, name: s.departmentName, total: 0, members: 0 };
    d.total += s.score;
    d.members++;
    byDept.set(s.departmentId, d);
  }
  return [...byDept.values()]
    .map((d) => ({ ...d, score: metricType === "KPI_SCORE" ? Math.round(d.total / Math.max(d.members, 1)) : d.total }))
    .sort((a, b) => b.score - a.score);
}

/** Most-improved: current-window score minus the previous equal-length window. */
export async function mostImproved(metricType: string, from: Date, to: Date): Promise<(Standing & { delta: number })[]> {
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);
  const prevTo = new Date(from.getTime() - 1);
  const [current, previous] = await Promise.all([
    individualStandings(metricType, from, to),
    metricByUser(metricType, prevFrom, prevTo),
  ]);
  return current
    .map((s) => ({ ...s, delta: s.score - (previous.get(s.userId) ?? 0) }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);
}
