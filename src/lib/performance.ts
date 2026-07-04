import { prisma } from "./prisma";
import { currentPeriod } from "./enums";

/**
 * Company-performance-linked scoring engine.
 *
 * Company Goal → Department Goal → Individual KPI → Job Handling → Result →
 * Diamond → PK → Bonus / Commission / Coaching / Promotion.
 *
 * All scores are 0–120 achievement percentages folded into 0–100+ weighted
 * scores. Formulas follow the management spec; weights live here so the whole
 * app computes them identically.
 */

// ---------------------------------------------------------------------------
// Weights & bands
// ---------------------------------------------------------------------------

export const COMPANY_WEIGHTS = {
  revenue: 25,
  grossProfit: 25,
  collection: 15,
  satisfaction: 10,
  accuracy: 10,
  shortBilling: 5,
  attendance: 5,
  proposals: 5,
} as const;

export const DEPARTMENT_WEIGHTS = {
  kpi: 50,
  jobVolume: 20,
  accuracy: 15,
  teamwork: 5,
  attendance: 5,
  proposals: 5,
} as const;

export const INDIVIDUAL_WEIGHTS = {
  company: 10,
  department: 20,
  personalKpi: 40,
  accuracy: 10,
  attendance: 5,
  teamwork: 5,
  proposals: 5,
  learning: 5,
} as const;

/** Company achievement multiplier bands (also used for department bonus). */
export function achievementMultiplier(score: number): number {
  if (score >= 95) return 1.5;
  if (score >= 90) return 1.2;
  if (score >= 80) return 1.0;
  if (score >= 70) return 0.5;
  return 0;
}

/** Grade bands: A+ ≥95, A 90–94, B 80–89, C 70–79, D 60–69, E <60. */
export function gradeForScore(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
}

/** Achievement % clamped to 0..cap (default 120). */
export function achievementPct(actual: number, target: number, cap = 120): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return Math.max(0, Math.min(cap, (actual / target) * 100));
}

/**
 * Job-volume score banding: below zeroBand → 0; zeroBand..target → linear
 * partial; target → 100; target..cap110 → up to 110; above → capped (120).
 */
export function jobVolumeScore(validJobs: number, target: number, zeroBand: number, cap110: number, capPct = 120): number {
  if (target <= 0) return 100;
  if (validJobs < zeroBand) return 0;
  if (validJobs < target) {
    // partial: linear between the zero band and the full target (50%..99%)
    return Math.round(50 + ((validJobs - zeroBand) / Math.max(1, target - zeroBand)) * 50);
  }
  if (validJobs === target) return 100;
  const capAt110 = cap110 > target ? cap110 : target;
  if (validJobs <= capAt110) return Math.min(110, 100 + ((validJobs - target) / Math.max(1, capAt110 - target)) * 10);
  return capPct;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

/** Valid job count for one user in a month (COMPLETED/IN_PROGRESS, KPI-valid). */
export async function validJobCount(userId: string, period: string): Promise<number> {
  return prisma.jobHandlingRecord.count({
    where: { userId, jobMonth: period, isValidForKPI: true, status: { in: ["COMPLETED", "IN_PROGRESS"] } },
  });
}

/** Company-wide attendance discipline % for a month: on-time days / records. */
async function attendanceDisciplinePct(period: string, userIds?: string[]): Promise<number> {
  const where = { period, ...(userIds ? { userId: { in: userIds } } : {}), clockIn: { not: null } };
  const [total, late] = await Promise.all([
    prisma.attendanceRecord.count({ where }),
    prisma.attendanceRecord.count({ where: { ...where, lateMinutes: { gt: 0 } } }),
  ]);
  if (total === 0) return 100;
  return Math.round(((total - late) / total) * 100);
}

/** Average approved KPI achievement % for a set of users in a period. */
async function avgKpiAchievement(period: string, userIds?: string[]): Promise<number> {
  const agg = await prisma.kPIResult.aggregate({
    where: { period, status: "APPROVED", ...(userIds ? { userId: { in: userIds } } : {}) },
    _avg: { achievementPct: true },
  });
  return Math.min(120, agg._avg.achievementPct ?? 0);
}

// ---------------------------------------------------------------------------
// COMPANY score
// ---------------------------------------------------------------------------

export interface CompanyComputation {
  period: string;
  actuals: { revenue: number; gp: number; collection: number; satisfactionPct: number; accuracyPct: number; shortBillingControlPct: number; attendancePct: number; proposalCount: number };
  achievements: Record<keyof typeof COMPANY_WEIGHTS, number>;
  score: number;
  grade: string;
  multiplier: number;
  hasGoal: boolean;
}

/**
 * Compute the company score for a month. Revenue/GP/collection come from
 * FinanceRecords (jobs created in the month); proposals & attendance are
 * derived; satisfaction/accuracy/short-billing use the values saved on
 * CompanyPerformance (entered by Boss/Finance) or sensible derivations.
 */
export async function computeCompanyPerformance(period = currentPeriod()): Promise<CompanyComputation> {
  const [goal, saved] = await Promise.all([
    prisma.companyGoal.findUnique({ where: { period } }),
    prisma.companyPerformance.findUnique({ where: { period } }),
  ]);

  const [y, m] = period.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m || 1, 1));

  const fin = await prisma.financeRecord.findMany({
    where: { createdAt: { gte: monthStart, lt: monthEnd } },
    select: { sellingPrice: true, grossProfit: true, paymentCollected: true, shortBilling: true, invoiceIssued: true },
  });
  const revenue = fin.reduce((s, f) => s + f.sellingPrice, 0);
  const gp = fin.reduce((s, f) => s + f.grossProfit, 0);
  const collection = fin.filter((f) => f.paymentCollected).reduce((s, f) => s + f.sellingPrice, 0);
  const shortBillingControlPct = fin.length === 0 ? (saved?.shortBillingControlPct || 100) : Math.round(((fin.length - fin.filter((f) => f.shortBilling).length) / fin.length) * 100);

  const [proposalCount, attendancePct] = await Promise.all([
    prisma.proposal.count({ where: { status: { in: ["ACCEPTED", "IMPLEMENTED", "REWARDED"] }, updatedAt: { gte: monthStart, lt: monthEnd } } }),
    attendanceDisciplinePct(period),
  ]);

  // Manual components (entered on the performance row); default to target if unset.
  const satisfactionPct = saved?.satisfactionPct || 0;
  const accuracyPct = saved?.accuracyPct || 0;

  const achievements = {
    revenue: achievementPct(revenue, goal?.revenueTarget ?? 0),
    grossProfit: achievementPct(gp, goal?.gpTarget ?? 0),
    collection: achievementPct(collection, goal?.collectionTarget ?? 0),
    satisfaction: achievementPct(satisfactionPct, goal?.satisfactionTargetPct ?? 90, 110),
    accuracy: achievementPct(accuracyPct, goal?.errorReductionTargetPct ?? 95, 110),
    shortBilling: achievementPct(shortBillingControlPct, goal?.shortBillingControlTargetPct ?? 100, 110),
    attendance: achievementPct(attendancePct, goal?.attendanceTargetPct ?? 95, 110),
    proposals: achievementPct(proposalCount, goal?.proposalAcceptedTarget ?? 0, 120),
  };

  const score = Math.round(
    (Object.keys(COMPANY_WEIGHTS) as (keyof typeof COMPANY_WEIGHTS)[]).reduce(
      (s, k) => s + (Math.min(achievements[k], 120) / 100) * COMPANY_WEIGHTS[k],
      0,
    ) * 10,
  ) / 10;

  return {
    period,
    actuals: { revenue, gp, collection, satisfactionPct, accuracyPct, shortBillingControlPct, attendancePct, proposalCount },
    achievements,
    score,
    grade: gradeForScore(score),
    multiplier: achievementMultiplier(score),
    hasGoal: !!goal,
  };
}

/** Persist the computed company performance row (keeps manual fields). */
export async function saveCompanyPerformance(period: string) {
  const c = await computeCompanyPerformance(period);
  return prisma.companyPerformance.upsert({
    where: { period },
    create: {
      period,
      revenueActual: c.actuals.revenue, gpActual: c.actuals.gp, collectionActual: c.actuals.collection,
      satisfactionPct: c.actuals.satisfactionPct, accuracyPct: c.actuals.accuracyPct,
      shortBillingControlPct: c.actuals.shortBillingControlPct, attendancePct: c.actuals.attendancePct,
      proposalCount: c.actuals.proposalCount,
      score: c.score, grade: c.grade, multiplier: c.multiplier,
      breakdownJson: JSON.stringify(c.achievements),
    },
    update: {
      revenueActual: c.actuals.revenue, gpActual: c.actuals.gp, collectionActual: c.actuals.collection,
      shortBillingControlPct: c.actuals.shortBillingControlPct, attendancePct: c.actuals.attendancePct,
      proposalCount: c.actuals.proposalCount,
      score: c.score, grade: c.grade, multiplier: c.multiplier,
      breakdownJson: JSON.stringify(c.achievements),
    },
  });
}

// ---------------------------------------------------------------------------
// DEPARTMENT score
// ---------------------------------------------------------------------------

export interface DepartmentComputation {
  departmentId: string;
  period: string;
  components: { kpi: number; jobVolume: number; accuracy: number; teamwork: number; attendance: number; proposals: number };
  validJobs: number;
  jobTarget: number;
  score: number;
  grade: string;
  multiplier: number;
}

export async function computeDepartmentPerformance(departmentId: string, period = currentPeriod()): Promise<DepartmentComputation> {
  const [goal, members] = await Promise.all([
    prisma.departmentGoal.findUnique({ where: { departmentId_period: { departmentId, period } } }),
    prisma.user.findMany({ where: { departmentId, isActive: true }, select: { id: true } }),
  ]);
  const ids = members.map((u) => u.id);

  const [y, m] = period.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m || 1, 1));

  const [kpiAvg, jobs, jobErrors, attendance, proposals, saved] = await Promise.all([
    avgKpiAchievement(period, ids),
    prisma.jobHandlingRecord.count({ where: { departmentId, jobMonth: period, isValidForKPI: true, status: { in: ["COMPLETED", "IN_PROGRESS"] } } }),
    prisma.jobHandlingRecord.aggregate({ where: { departmentId, jobMonth: period }, _sum: { errorCount: true }, _count: true }),
    attendanceDisciplinePct(period, ids),
    prisma.proposal.count({ where: { submittedById: { in: ids }, status: { in: ["ACCEPTED", "IMPLEMENTED", "REWARDED"] }, updatedAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.departmentPerformance.findUnique({ where: { departmentId_period: { departmentId, period } } }),
  ]);

  const jobTarget = goal?.jobVolumeTarget ?? 0;
  const totalJobs = jobErrors._count;
  const errs = jobErrors._sum.errorCount ?? 0;
  const accuracy = totalJobs === 0 ? 100 : Math.max(0, Math.round(((totalJobs - errs) / totalJobs) * 100));

  const components = {
    kpi: Math.min(120, kpiAvg),
    jobVolume: jobTarget > 0 ? achievementPct(jobs, jobTarget) : 100,
    accuracy: achievementPct(accuracy, goal?.accuracyTargetPct ?? 95, 110),
    teamwork: saved?.teamworkScore || 100, // manually rated by Boss (default full)
    attendance: achievementPct(attendance, 95, 110),
    proposals: achievementPct(proposals, goal?.proposalTarget ?? 1, 120),
  };

  const score = Math.round(
    ((Math.min(components.kpi, 120) / 100) * DEPARTMENT_WEIGHTS.kpi +
      (Math.min(components.jobVolume, 120) / 100) * DEPARTMENT_WEIGHTS.jobVolume +
      (Math.min(components.accuracy, 110) / 100) * DEPARTMENT_WEIGHTS.accuracy +
      (Math.min(components.teamwork, 110) / 100) * DEPARTMENT_WEIGHTS.teamwork +
      (Math.min(components.attendance, 110) / 100) * DEPARTMENT_WEIGHTS.attendance +
      (Math.min(components.proposals, 120) / 100) * DEPARTMENT_WEIGHTS.proposals) * 10,
  ) / 10;

  return { departmentId, period, components, validJobs: jobs, jobTarget, score, grade: gradeForScore(score), multiplier: achievementMultiplier(score) };
}

export async function saveDepartmentPerformance(departmentId: string, period: string) {
  const d = await computeDepartmentPerformance(departmentId, period);
  return prisma.departmentPerformance.upsert({
    where: { departmentId_period: { departmentId, period } },
    create: {
      departmentId, period,
      kpiScore: d.components.kpi, jobVolumeScore: d.components.jobVolume, accuracyScore: d.components.accuracy,
      teamworkScore: d.components.teamwork, attendanceScore: d.components.attendance, proposalScore: d.components.proposals,
      score: d.score, grade: d.grade, multiplier: d.multiplier,
    },
    update: {
      kpiScore: d.components.kpi, jobVolumeScore: d.components.jobVolume, accuracyScore: d.components.accuracy,
      attendanceScore: d.components.attendance, proposalScore: d.components.proposals,
      score: d.score, grade: d.grade, multiplier: d.multiplier,
    },
  });
}

// ---------------------------------------------------------------------------
// INDIVIDUAL score (universal formula)
// ---------------------------------------------------------------------------

export interface IndividualComputation {
  userId: string;
  period: string;
  components: { company: number; department: number; personalKpi: number; accuracy: number; attendance: number; teamwork: number; proposals: number; learning: number };
  validJobs: number;
  jobTarget: number;
  jobVolumePct: number;
  score: number;
  grade: string;
  positionName: string | null;
}

/** Find the PositionKPI template matching a user (by department, else null). */
export async function positionForUser(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true, jobTitle: true } });
  if (!u) return null;
  const all = await prisma.positionKPI.findMany({ where: { isActive: true } });
  // department match first, then job-title contains, else null
  return (
    all.find((p) => p.departmentId && p.departmentId === u.departmentId) ??
    all.find((p) => u.jobTitle && p.name.toLowerCase().split(" ")[0] === u.jobTitle.toLowerCase().split(" ")[0]) ??
    null
  );
}

export async function computeIndividualPerformance(userId: string, period = currentPeriod()): Promise<IndividualComputation> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  const [y, m] = period.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m || 1, 1));

  const [company, dept, personalKpi, jobs, jobAgg, attendance, proposals, trainingDone, position] = await Promise.all([
    computeCompanyPerformance(period),
    user?.departmentId ? computeDepartmentPerformance(user.departmentId, period) : Promise.resolve(null),
    avgKpiAchievement(period, [userId]),
    validJobCount(userId, period),
    prisma.jobHandlingRecord.aggregate({ where: { userId, jobMonth: period }, _sum: { errorCount: true }, _avg: { qualityScore: true }, _count: true }),
    attendanceDisciplinePct(period, [userId]),
    prisma.proposal.count({ where: { submittedById: userId, status: { in: ["ACCEPTED", "IMPLEMENTED", "REWARDED"] }, updatedAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.trainingCompletion.count({ where: { userId, passed: true, completedAt: { gte: monthStart, lt: monthEnd } } }),
    positionForUser(userId),
  ]);

  const jobTarget = position?.minJobTarget ?? 0;
  const volumePct = jobTarget > 0
    ? jobVolumeScore(jobs, jobTarget, position?.zeroBandBelow ?? Math.floor(jobTarget * 0.8), position?.cap110At ?? Math.round(jobTarget * 1.25), position?.volumeCapPct ?? 120)
    : 100;

  const errs = jobAgg._sum.errorCount ?? 0;
  const accuracy = jobAgg._count === 0 ? 100 : Math.max(0, Math.min(110, Math.round(((jobAgg._count - errs) / jobAgg._count) * (jobAgg._avg.qualityScore ?? 100))));

  const components = {
    company: Math.min(company.score, 120),
    department: dept ? Math.min(dept.score, 120) : 100,
    // Personal KPI blends approved KPI results with job-volume achievement when a job target exists.
    personalKpi: jobTarget > 0 ? Math.round((Math.min(personalKpi || volumePct, 120) + volumePct) / 2) : Math.min(personalKpi || 0, 120),
    accuracy,
    attendance: Math.min(110, attendance),
    teamwork: 100, // manual rating hook (defaults to full)
    proposals: Math.min(120, proposals > 0 ? 100 + Math.min(20, (proposals - 1) * 10) : 60),
    learning: trainingDone > 0 ? 100 : 70,
  };

  const score = Math.round(
    (Object.keys(INDIVIDUAL_WEIGHTS) as (keyof typeof INDIVIDUAL_WEIGHTS)[]).reduce(
      (s, k) => s + (components[k] / 100) * INDIVIDUAL_WEIGHTS[k],
      0,
    ) * 10,
  ) / 10;

  return { userId, period, components, validJobs: jobs, jobTarget, jobVolumePct: volumePct, score, grade: gradeForScore(score), positionName: position?.name ?? null };
}

// ---------------------------------------------------------------------------
// Coaching triggers
// ---------------------------------------------------------------------------

/** Reasons a staff member should be flagged for coaching this month. */
export async function coachingTriggers(userId: string, period = currentPeriod()): Promise<string[]> {
  const [ind, deductions, lateCount, openCases] = await Promise.all([
    computeIndividualPerformance(userId, period),
    prisma.pointsTransaction.aggregate({ where: { userId, period, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.attendanceRecord.count({ where: { userId, period, lateMinutes: { gt: 0 } } }),
    prisma.deductionCase.count({ where: { userId, status: "APPROVED", createdAt: { gte: new Date(Date.now() - 90 * 864e5) } } }),
  ]);
  const reasons: string[] = [];
  if (ind.score < 70) reasons.push(`Monthly score ${ind.score} is below 70.`);
  if (ind.jobTarget > 0 && ind.validJobs < ind.jobTarget) reasons.push(`Valid jobs ${ind.validJobs}/${ind.jobTarget} below the minimum target.`);
  const deducted = Math.abs(deductions._sum.amount ?? 0);
  if (deducted >= 150) reasons.push(`Diamond deductions this month total ${deducted} 💎.`);
  if (lateCount > 3) reasons.push(`Late ${lateCount} times this month.`);
  if (openCases >= 3) reasons.push(`${openCases} approved deduction cases in the last 90 days (repeated mistakes).`);
  return reasons;
}
