import { prisma } from "./prisma";
import { currentPeriod } from "./enums";

/**
 * Sales commission — based on COLLECTED gross profit, never raw revenue.
 *
 * Eligibility (spec): invoice issued + payment collected + job not
 * loss-making + GP confirmed by Finance + no unresolved red-line issue.
 * Tier ladder by GP-target achievement:
 *   <70% → 0% · 70–89% → 1% · 90–99% → 2% · 100–119% → 3% ·
 *   120–149% → 4% · ≥150% → 5% (needs Boss approval)
 */

export function commissionTierPct(achievementPct: number): number {
  if (achievementPct >= 150) return 5;
  if (achievementPct >= 120) return 4;
  if (achievementPct >= 100) return 3;
  if (achievementPct >= 90) return 2;
  if (achievementPct >= 70) return 1;
  return 0;
}

export interface CollectedGP {
  userId: string;
  collectedGP: number;      // GP of jobs invoiced + collected + profitable
  uncollectedGP: number;    // GP still waiting for payment (held)
  lossMakingJobs: number;   // excluded jobs with GP <= 0
  jobCount: number;
}

/** Sum a salesperson's eligible collected GP for the month. */
export async function collectedGPForUser(userId: string, period = currentPeriod()): Promise<CollectedGP> {
  const [y, m] = period.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m || 1, 1));
  const records = await prisma.financeRecord.findMany({
    where: { salespersonId: userId, createdAt: { gte: monthStart, lt: monthEnd } },
    select: { grossProfit: true, paymentCollected: true, invoiceIssued: true },
  });
  let collected = 0, uncollected = 0, lossMaking = 0;
  for (const r of records) {
    if (r.grossProfit <= 0) { lossMaking++; continue; }
    if (r.invoiceIssued && r.paymentCollected) collected += r.grossProfit;
    else uncollected += r.grossProfit;
  }
  return { userId, collectedGP: collected, uncollectedGP: uncollected, lossMakingJobs: lossMaking, jobCount: records.length };
}

/** Compute (and upsert as PENDING) the commission record for one salesperson. */
export async function computeCommission(userId: string, period: string, gpTarget: number) {
  const gp = await collectedGPForUser(userId, period);
  const achievement = gpTarget > 0 ? Math.round((gp.collectedGP / gpTarget) * 1000) / 10 : 0;
  const tierPct = commissionTierPct(achievement);
  const amount = Math.round(gp.collectedGP * (tierPct / 100) * 100) / 100;

  const existing = await prisma.commissionRecord.findUnique({ where: { userId_period: { userId, period } } });
  // Approved/paid records are frozen — recompute only pending/held ones.
  if (existing && ["APPROVED", "PAID"].includes(existing.status)) return existing;

  return prisma.commissionRecord.upsert({
    where: { userId_period: { userId, period } },
    create: { userId, period, gpTarget, gpCollected: gp.collectedGP, achievementPct: achievement, tierPct, amount },
    update: { gpTarget, gpCollected: gp.collectedGP, achievementPct: achievement, tierPct, amount, status: existing?.status === "HELD" ? "HELD" : "PENDING" },
  });
}
