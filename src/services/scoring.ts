import { prisma } from "@/lib/prisma";
import { currentPeriod, weightedScore, gradeFor, GRADE_LUCKY_ENTRIES } from "@/lib/enums";
import { notify } from "@/lib/notify";

/**
 * Monthly performance score (spec formula):
 *   Score = KPI×50% + Task×20% + Accuracy×15% + Teamwork×10% + Discipline×5%
 * The component scores are derived from real data with pragmatic proxies so the
 * grade can be computed automatically for the MVP.
 */
export async function computeMonthlyScore(userId: string, period = currentPeriod()) {
  const monthStart = new Date(`${period}-01T00:00:00`);
  const nextMonth = new Date(monthStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const [kpiResults, tasks, penaltyTx, teamworkTx, reports] = await Promise.all([
    prisma.kPIResult.findMany({ where: { userId, period } }),
    prisma.task.findMany({ where: { assigneeId: userId, deadline: { gte: monthStart, lt: nextMonth } } }),
    prisma.pointsTransaction.findMany({ where: { userId, period, type: "PENALTY" } }),
    prisma.pointsTransaction.count({ where: { userId, period, type: "TEAMWORK" } }),
    prisma.dailyReport.count({ where: { userId, date: { gte: monthStart, lt: nextMonth } } }),
  ]);

  const kpiScore = kpiResults.length
    ? Math.min(100, Math.round(kpiResults.reduce((s, r) => s + r.achievementPct, 0) / kpiResults.length))
    : 0;

  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const taskScore = tasks.length ? Math.round((completed / tasks.length) * 100) : (kpiScore ? 80 : 0);

  // Accuracy: start at 100, lose 8 per penalty incident.
  const accuracyScore = Math.max(0, 100 - penaltyTx.length * 8);
  const teamworkScore = Math.min(100, 70 + teamworkTx * 10);
  const disciplineScore = Math.min(100, 50 + reports * 6);

  const total = weightedScore({ kpi: kpiScore, task: taskScore, accuracy: accuracyScore, teamwork: teamworkScore, discipline: disciplineScore });
  const overdueCount = tasks.filter((t) => t.status === "OVERDUE").length;
  const monthlyDeducted = penaltyTx.reduce((s, t) => s + Math.abs(t.amount), 0);

  return {
    kpiScore, taskScore, accuracyScore, teamworkScore, disciplineScore,
    totalScore: total, grade: gradeFor(total),
    overdueCount, monthlyDeducted,
  };
}

/** Generate (upsert) the monthly performance review for a staff member. */
export async function generateReview(userId: string, managerId: string | null, period = currentPeriod()) {
  const s = await computeMonthlyScore(userId, period);
  const promotion = s.grade === "A_PLUS" || s.grade === "A" ? "Consider for promotion / stretch role" : "—";
  const reward = s.totalScore >= 85 ? "Eligible for reward & lucky draw entry" : "—";
  const improvement = s.totalScore < 70 ? "Coaching required — focus on weakest KPI and task punctuality." : "Maintain momentum.";

  await prisma.performanceReview.upsert({
    where: { staffId_period: { staffId: userId, period } },
    create: {
      staffId: userId, managerId, period,
      kpiScore: s.kpiScore, taskScore: s.taskScore, accuracyScore: s.accuracyScore,
      teamworkScore: s.teamworkScore, disciplineScore: s.disciplineScore, totalScore: s.totalScore,
      finalGrade: s.grade, promotionRecommendation: promotion, rewardRecommendation: reward, improvementPlan: improvement,
    },
    update: {
      managerId,
      kpiScore: s.kpiScore, taskScore: s.taskScore, accuracyScore: s.accuracyScore,
      teamworkScore: s.teamworkScore, disciplineScore: s.disciplineScore, totalScore: s.totalScore,
      finalGrade: s.grade, promotionRecommendation: promotion, rewardRecommendation: reward, improvementPlan: improvement,
    },
  });
  await checkScoreTriggers(userId, s, period);
  await grantGradeEntries(userId, s.grade);
  return s;
}

/**
 * Grant lucky-draw entries based on the monthly grade (A+ = 5, A = 3, B = 1).
 * Idempotent per active campaign: replaces any previous GRADE entries so
 * re-running "Generate Reviews" does not stack entries.
 */
async function grantGradeEntries(userId: string, grade: string) {
  const entries = GRADE_LUCKY_ENTRIES[grade] ?? 0;
  const campaign = await prisma.luckyDrawCampaign.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  if (!campaign) return;
  await prisma.luckyDrawEntry.deleteMany({ where: { campaignId: campaign.id, userId, sourceType: "GRADE" } });
  if (entries > 0) {
    await prisma.luckyDrawEntry.create({ data: { campaignId: campaign.id, userId, entryCount: entries, sourceType: "GRADE" } });
  }
}

/**
 * Automatic coaching triggers (spec). Creates an OPEN coaching record when a
 * threshold is crossed, de-duplicated per trigger per month.
 */
export async function checkScoreTriggers(
  userId: string,
  s: Awaited<ReturnType<typeof computeMonthlyScore>>,
  period = currentPeriod(),
) {
  const staff = await prisma.user.findUnique({ where: { id: userId } });
  if (!staff) return;
  const coachId = staff.managerId ?? userId;

  const triggers: { key: string; issue: string; category: string }[] = [];
  if (s.totalScore < 70) triggers.push({ key: "LOW_SCORE", issue: `Monthly score ${s.totalScore} is below 70.`, category: "KPI_MISSED" });
  if (s.kpiScore < 70) triggers.push({ key: "LOW_KPI", issue: `KPI achievement ${s.kpiScore}% is below 70%.`, category: "KPI_MISSED" });
  if (s.monthlyDeducted > 100) triggers.push({ key: "HIGH_DEDUCTION", issue: `Point deductions (${s.monthlyDeducted}) exceeded 100 this month.`, category: "BEHAVIOUR" });
  if (s.overdueCount > 3) triggers.push({ key: "OVERDUE", issue: `${s.overdueCount} tasks overdue this month (limit 3).`, category: "TASK_MISSED" });

  for (const t of triggers) {
    await createCoachingIfAbsent(userId, coachId, t.category, t.issue, t.key, period);
  }
}

/** Create a coaching record for a trigger if no matching OPEN one exists this month. */
export async function createCoachingIfAbsent(
  staffId: string, coachId: string, category: string, issue: string, triggeredBy: string, period: string,
) {
  const monthStart = new Date(`${period}-01T00:00:00`);
  const existing = await prisma.coachingRecord.findFirst({
    where: { staffId, triggeredBy, status: { not: "RESOLVED" }, createdAt: { gte: monthStart } },
  });
  if (existing) return;

  await prisma.coachingRecord.create({
    data: { staffId, coachId, category, issue, triggeredBy, status: "OPEN" },
  });
  await notify(prisma, { userId: staffId, type: "COACHING_ASSIGNED", title: "Coaching alert", body: issue, link: "/coaching" });
  // Alert the coach too.
  if (coachId !== staffId) {
    await notify(prisma, { userId: coachId, type: "COACHING_ASSIGNED", title: "Coaching triggered for your team", body: issue, link: "/coaching" });
  }
}
