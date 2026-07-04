import { prisma } from "./prisma";
import { currentPeriod } from "./enums";
import { computeCompanyPerformance, computeDepartmentPerformance, computeIndividualPerformance, achievementMultiplier } from "./performance";

/**
 * Team Bonus Pool for non-sales departments.
 *
 * Pool = monthly collected GP × pool % × company achievement multiplier.
 * Department bonus = pool × allocation % × department score multiplier.
 * Individual bonus = department bonus × (individual score / dept total scores),
 * with red-line/negligence staff excluded unless Boss overrides.
 */

/** Default allocation percentages, matched to departments by name keywords. */
export const DEFAULT_ALLOCATIONS: { label: string; pct: number; match: string[] }[] = [
  { label: "Customer Service", pct: 15, match: ["customer service", "cs"] },
  { label: "Operation", pct: 15, match: ["operation", "ops"] },
  { label: "Forwarding / Declaration", pct: 15, match: ["forwarding", "declaration", "customs"] },
  { label: "Finance / Account", pct: 15, match: ["finance", "account"] },
  { label: "Haulage / Transport", pct: 10, match: ["haulage", "transport", "trucking"] },
  { label: "Runner / Dispatch", pct: 10, match: ["runner", "dispatch"] },
  { label: "Marketing", pct: 10, match: ["marketing"] },
  { label: "HR / Admin", pct: 5, match: ["hr", "admin", "human"] },
  { label: "Management reserve", pct: 5, match: [] },
];

function allocationFor(deptName: string): { label: string; pct: number } | null {
  const n = deptName.toLowerCase();
  for (const a of DEFAULT_ALLOCATIONS) {
    if (a.match.some((k) => n.includes(k))) return { label: a.label, pct: a.pct };
  }
  return null;
}

/** Staff excluded from the pool: open red-line coaching or red-line deduction case. */
async function exclusionReason(userId: string): Promise<string | null> {
  const [redLineCoaching, redLineCase] = await Promise.all([
    prisma.coachingRecord.findFirst({ where: { staffId: userId, triggeredBy: "RED_LINE", status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } } }),
    prisma.deductionCase.findFirst({ where: { userId, severity: "RED_LINE", status: { in: ["OPEN", "EXPLAINED", "APPROVED"] } } }),
  ]);
  if (redLineCoaching) return "Open red-line coaching case";
  if (redLineCase) return "Red-line deduction case";
  return null;
}

/**
 * Build (or rebuild) the full bonus pool for a month: pool amount, department
 * allocations with score multipliers, and individual splits by score weight.
 * Approved pools are frozen.
 */
export async function buildBonusPool(period = currentPeriod(), poolPctOverride?: number) {
  const existing = await prisma.bonusPool.findUnique({ where: { period } });
  if (existing && existing.status !== "DRAFT") return existing;

  const [company, goal] = await Promise.all([
    computeCompanyPerformance(period),
    prisma.companyGoal.findUnique({ where: { period } }),
  ]);
  const poolPct = poolPctOverride ?? goal?.bonusPoolPct ?? 2;
  const collectedGP = company.actuals.collection > 0
    ? // GP portion of collected jobs — approximate with GP actual scaled by collection ratio when revenue known
      company.actuals.revenue > 0
      ? Math.round(company.actuals.gp * (company.actuals.collection / company.actuals.revenue) * 100) / 100
      : company.actuals.gp
    : 0;
  const multiplier = company.multiplier;
  const poolAmount = Math.round(collectedGP * (poolPct / 100) * multiplier * 100) / 100;

  // Reset and rebuild allocations.
  if (existing) await prisma.departmentBonusAllocation.deleteMany({ where: { bonusPoolId: existing.id } });
  const pool = await prisma.bonusPool.upsert({
    where: { period },
    create: { period, collectedGP, poolPct, companyMultiplier: multiplier, poolAmount },
    update: { collectedGP, poolPct, companyMultiplier: multiplier, poolAmount },
  });

  const departments = await prisma.department.findMany({ where: { status: "ACTIVE" } });
  for (const dept of departments) {
    const alloc = allocationFor(dept.name);
    if (!alloc) continue; // Sales & unmatched departments are not in the pool
    const perf = await computeDepartmentPerformance(dept.id, period);
    const deptMultiplier = achievementMultiplier(perf.score);
    const amount = Math.round(poolAmount * (alloc.pct / 100) * deptMultiplier * 100) / 100;
    const row = await prisma.departmentBonusAllocation.create({
      data: { bonusPoolId: pool.id, departmentId: dept.id, label: `${dept.name}`, allocationPct: alloc.pct, deptScore: perf.score, multiplier: deptMultiplier, amount },
    });

    // Individual split by score weight.
    const members = await prisma.user.findMany({ where: { departmentId: dept.id, isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] } }, select: { id: true } });
    const scored: { userId: string; score: number; excluded: string | null }[] = [];
    for (const mem of members) {
      const ind = await computeIndividualPerformance(mem.id, period);
      scored.push({ userId: mem.id, score: ind.score, excluded: await exclusionReason(mem.id) });
    }
    const totalScore = scored.filter((s) => !s.excluded).reduce((s, x) => s + x.score, 0);
    for (const s of scored) {
      const weight = s.excluded || totalScore === 0 ? 0 : Math.round((s.score / totalScore) * 10000) / 10000;
      await prisma.individualBonusAllocation.create({
        data: { allocationId: row.id, userId: s.userId, score: s.score, weight, amount: Math.round(amount * weight * 100) / 100, excluded: !!s.excluded, excludeReason: s.excluded },
      });
    }
  }

  // Management reserve line (5%).
  await prisma.departmentBonusAllocation.create({
    data: { bonusPoolId: pool.id, departmentId: null, label: "Management reserve", allocationPct: 5, deptScore: 0, multiplier: 1, amount: Math.round(poolAmount * 0.05 * 100) / 100 },
  });

  return prisma.bonusPool.findUnique({ where: { period }, include: { allocations: { include: { individuals: true } } } });
}
