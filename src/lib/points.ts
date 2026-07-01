import { prisma } from "./prisma";
import { currentPeriod, levelForLifetime } from "./enums";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Core points engine (section F / Q).
 * Records an immutable PointsTransaction and recomputes the user's wallet
 * aggregates + growth level. Positive amount = earn, negative = deduct/redeem.
 */
export async function awardPoints(
  db: Db,
  args: {
    userId: string;
    amount: number;
    type: string;
    reason: string;
    refType?: string;
    refId?: string;
    period?: string;
    // Optional provenance for owner/system-generated grants (onboarding bonus, …)
    sourceType?: string;
    generatedBy?: string;
    internalNote?: string;
    status?: string;
    // Diamond Authority module: richer classification + wallet snapshot.
    transactionType?: string;
    balanceBefore?: number;
    balanceAfter?: number;
    departmentId?: string;
    approvedBy?: string;
    relatedTransactionId?: string;
    effectiveDate?: Date;
  },
): Promise<string> {
  const period = args.period ?? currentPeriod();

  const tx = await db.pointsTransaction.create({
    data: {
      userId: args.userId,
      amount: args.amount,
      type: args.type,
      reason: args.reason,
      refType: args.refType,
      refId: args.refId,
      sourceType: args.sourceType,
      generatedBy: args.generatedBy,
      internalNote: args.internalNote,
      status: args.status ?? "APPROVED",
      transactionType: args.transactionType,
      balanceBefore: args.balanceBefore,
      balanceAfter: args.balanceAfter,
      departmentId: args.departmentId,
      approvedBy: args.approvedBy,
      relatedTransactionId: args.relatedTransactionId,
      effectiveDate: args.effectiveDate,
      period,
    },
    select: { id: true },
  });

  await recomputeWallet(db, args.userId);
  return tx.id;
}

/** Recompute wallet aggregate columns + growth level from the ledger. */
export async function recomputeWallet(db: Db, userId: string) {
  const txns = await db.pointsTransaction.findMany({ where: { userId } });
  const period = currentPeriod();

  let current = 0;
  let lifetime = 0;
  let deducted = 0;
  let redeemed = 0;
  let monthlyEarned = 0;
  let monthlyDeducted = 0;

  for (const t of txns) {
    current += t.amount;
    if (t.amount > 0) lifetime += t.amount;
    // Redemptions are tracked separately; every other negative entry (penalty,
    // owner deduction/adjustment, reversal of an earn) counts as "deducted".
    if (t.amount < 0) {
      if (t.type === "REDEMPTION") redeemed += Math.abs(t.amount);
      else deducted += Math.abs(t.amount);
    }
    if (t.period === period) {
      if (t.amount > 0) monthlyEarned += t.amount;
      else if (t.type !== "REDEMPTION") monthlyDeducted += Math.abs(t.amount);
    }
  }

  await db.user.update({
    where: { id: userId },
    data: {
      currentPoints: current,
      lifetimePoints: lifetime,
      deductedPoints: deducted,
      redeemedPoints: redeemed,
      monthlyEarned,
      monthlyDeducted,
      growthLevel: levelForLifetime(lifetime),
    },
  });
}

/**
 * KPI Points = achievementRate × pointMultiplier, capped at maxPoints.
 * (e.g. GP achievement 120% × multiplier 2 = 240, capped at 250.)
 */
export function kpiPoints(achievementRate: number, pointMultiplier: number, maxPoints: number): number {
  const raw = Math.round(Math.max(0, achievementRate) * pointMultiplier);
  return Math.min(raw, maxPoints);
}
