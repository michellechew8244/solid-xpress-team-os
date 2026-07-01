import { prisma } from "@/lib/prisma";
import { currentPeriod } from "@/lib/enums";

/**
 * Aggregations for the Management (Boss) dashboard — section B.
 * Drill-down filters (month/department) can be layered on top later; this MVP
 * computes the current period across the whole company.
 */
export async function getBossDashboard() {
  const period = currentPeriod();

  const [
    finance,
    departments,
    topStaff,
    bottomStaff,
    overdueTasks,
    complaints,
    jobs,
    todayReports,
    redemptions,
  ] = await Promise.all([
    prisma.financeRecord.findMany({ include: { job: true } }),
    prisma.department.findMany(),
    prisma.user.findMany({
      where: { role: "STAFF" },
      orderBy: { currentPoints: "desc" },
      take: 10,
      include: { department: true },
    }),
    prisma.user.findMany({
      where: { role: "STAFF" },
      orderBy: { currentPoints: "asc" },
      take: 10,
      include: { department: true },
    }),
    prisma.task.findMany({
      where: { status: "OVERDUE" },
      include: { department: true, assignee: true },
    }),
    prisma.task.count({ where: { type: "CUSTOMER_ISSUE", status: { notIn: ["COMPLETED", "REJECTED"] } } }),
    prisma.job.findMany({ include: { milestones: true } }),
    prisma.dailyReport.findMany({
      where: { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.rewardRedemption.findMany({ where: { status: { in: ["APPROVED", "FULFILLED"] } } }),
  ]);

  // Revenue / GP (achieved = invoiced jobs; target from department settings)
  const revenueAchieved = finance.reduce((s, f) => s + (f.invoiceIssued ? f.sellingPrice : 0), 0);
  const gpAchieved = finance.reduce((s, f) => s + (f.invoiceIssued ? f.grossProfit : 0), 0);
  const revenueTarget = departments.reduce((s, d) => s + d.revenueTarget, 0) || 720000;
  const gpTarget = departments.reduce((s, d) => s + d.grossProfitTarget, 0) || 220000;

  // Department KPI achievement (avg achievementPct across results in period)
  const kpiResults = await prisma.kPIResult.findMany({
    where: { period },
    include: { kpi: { include: { department: true } } },
  });
  const deptKpiMap = new Map<string, { sum: number; n: number }>();
  for (const r of kpiResults) {
    const name = r.kpi.department.name;
    const cur = deptKpiMap.get(name) ?? { sum: 0, n: 0 };
    cur.sum += r.achievementPct;
    cur.n += 1;
    deptKpiMap.set(name, cur);
  }
  const deptKpi = Array.from(deptKpiMap.entries())
    .map(([name, { sum, n }]) => ({ name, value: Math.round(sum / Math.max(n, 1)) }))
    .sort((a, b) => b.value - a.value);

  // Overdue tasks grouped by department
  const overdueByDept = new Map<string, number>();
  for (const t of overdueTasks) {
    const name = t.department?.name ?? "Unassigned";
    overdueByDept.set(name, (overdueByDept.get(name) ?? 0) + 1);
  }

  // Pending operational queues from job/milestone state
  const milestoneDone = (j: (typeof jobs)[number], stage: string) =>
    j.milestones.find((m) => m.stage === stage)?.done ?? false;

  const billingPending = jobs.filter((j) => j.billingStatus === "UNBILLED").length;
  const collectionPending = jobs.filter((j) => j.collectionStatus !== "COLLECTED").length;
  const unbilledJobs = jobs.filter((j) => j.status === "CLOSED" && j.billingStatus === "UNBILLED").length;
  const permitPending = jobs.filter((j) => j.permitRequired && !milestoneDone(j, "PERMIT_APPROVED")).length;
  const customsPending = jobs.filter((j) => !milestoneDone(j, "CUSTOMS_RELEASED")).length;
  const haulagePending = jobs.filter((j) => !milestoneDone(j, "CARGO_DELIVERED")).length;
  const runnerPending = jobs.filter((j) => !milestoneDone(j, "DO_COLLECTED")).length;

  // Daily team energy (avg energyLevel today, scaled to %)
  const energy =
    todayReports.length > 0
      ? Math.round((todayReports.reduce((s, r) => s + r.energyLevel, 0) / todayReports.length) * 20)
      : 0;

  // Weekly department ranking by points earned this period
  const periodTx = await prisma.pointsTransaction.findMany({
    where: { period, amount: { gt: 0 } },
    include: { user: { include: { department: true } } },
  });
  const deptPoints = new Map<string, number>();
  for (const t of periodTx) {
    const name = t.user.department?.name ?? "—";
    deptPoints.set(name, (deptPoints.get(name) ?? 0) + t.amount);
  }
  const deptRanking = Array.from(deptPoints.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const rewardBudgetUsed = redemptions.reduce((s, r) => s + r.pointsSpent, 0);
  const pointsIssued = periodTx.reduce((s, t) => s + t.amount, 0);

  // Additional company metrics for the boss dashboard.
  const [totalStaff, deductTx, pendingRedemptions, reviews, coachingNeeded, activeCampaign, recentTx] =
    await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.pointsTransaction.findMany({ where: { period, type: "PENALTY", amount: { lt: 0 } } }),
      prisma.rewardRedemption.count({ where: { status: "PENDING" } }),
      prisma.performanceReview.findMany({ where: { period }, select: { totalScore: true, finalGrade: true } }),
      prisma.coachingRecord.count({ where: { status: { not: "RESOLVED" } } }),
      prisma.luckyDrawCampaign.findFirst({ where: { status: "ACTIVE" }, include: { entries: true }, orderBy: { createdAt: "desc" } }),
      prisma.pointsTransaction.findMany({ where: { amount: { gt: 0 }, createdAt: { gte: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000) } }, select: { amount: true, createdAt: true } }),
    ]);

  const pointsDeducted = deductTx.reduce((s, t) => s + Math.abs(t.amount), 0);

  // Company performance score = average of approved monthly review scores.
  const companyScore = reviews.length ? Math.round(reviews.reduce((s, r) => s + r.totalScore, 0) / reviews.length) : 0;

  // Staff-by-grade distribution.
  const gradeOrder = ["A_PLUS", "A", "B", "C", "D", "E"];
  const gradeCount = new Map<string, number>();
  for (const r of reviews) if (r.finalGrade) gradeCount.set(r.finalGrade, (gradeCount.get(r.finalGrade) ?? 0) + 1);
  const gradeDistribution = gradeOrder.map((g) => ({ name: g === "A_PLUS" ? "A+" : g, value: gradeCount.get(g) ?? 0 }));

  // Lucky draw participation.
  const luckyParticipants = activeCampaign ? new Set(activeCampaign.entries.map((e) => e.userId)).size : 0;
  const luckyEntries = activeCampaign ? activeCampaign.entries.reduce((s, e) => s + e.entryCount, 0) : 0;

  // Monthly trend — points earned per week over the last 6 weeks.
  const weekBuckets = new Array(6).fill(0);
  const now = Date.now();
  for (const t of recentTx) {
    const weeksAgo = Math.floor((now - new Date(t.createdAt).getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksAgo >= 0 && weeksAgo < 6) weekBuckets[5 - weeksAgo] += t.amount;
  }
  const monthlyTrend = weekBuckets.map((value, i) => ({ name: `W${i + 1}`, value }));

  return {
    totalStaff,
    companyScore,
    pointsIssued,
    pointsDeducted,
    rewardsRedeemedCount: redemptions.length,
    pendingRedemptions,
    coachingNeeded,
    luckyParticipants,
    luckyEntries,
    gradeDistribution,
    monthlyTrend,
    revenueAchieved,
    revenueTarget,
    gpAchieved,
    gpTarget,
    deptKpi,
    topStaff,
    bottomStaff,
    overdueByDept: Array.from(overdueByDept.entries()).map(([name, value]) => ({ name, value })),
    overdueCount: overdueTasks.length,
    complaints,
    queues: { billingPending, collectionPending, unbilledJobs, permitPending, customsPending, haulagePending, runnerPending },
    energy,
    reportsSubmitted: todayReports.length,
    deptRanking,
    rewardBudgetUsed,
  };
}
