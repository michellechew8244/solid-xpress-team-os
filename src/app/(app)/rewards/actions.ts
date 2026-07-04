"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canManageRewards } from "@/lib/rbac";
import { awardPoints } from "@/lib/points";
import { notify } from "@/lib/notify";
import { leaveBlockReason } from "@/services/leave";

/**
 * Reward redemption flow (section F):
 * 1. Staff selects reward → 2. system checks balance → 3. submits redemption
 * (PENDING, points NOT yet deducted) → 4. HR/Admin approves → 5. points
 * deducted → 6. status updated → 7. staff notified.
 */
export async function redeemReward(rewardId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const [reward, user] = await Promise.all([
    prisma.reward.findUnique({ where: { id: rewardId } }),
    prisma.user.findUnique({ where: { id: session.id } }),
  ]);
  if (!reward || !user) throw new Error("Not found");
  if (!user.isActive || user.accessStatus !== "ACTIVE") throw new Error("Deactivated accounts cannot redeem rewards.");
  if (!reward.isActive) throw new Error("This reward is no longer available");
  // stock -1 = unlimited; 0 or less = out of stock.
  if (reward.stock === 0) throw new Error("This reward is out of stock");
  if (user.currentPoints < reward.pointsCost) throw new Error("Insufficient points");

  // Leave rewards are blocked under certain conditions (spec §C).
  if (reward.category === "EXTRA_LEAVE") {
    const blocked = await leaveBlockReason(user.id);
    if (blocked) throw new Error(`Leave reward blocked: ${blocked}.`);
  }

  await prisma.rewardRedemption.create({
    data: { rewardId, userId: user.id, pointsSpent: reward.pointsCost, status: "PENDING" },
  });

  // Notify reward approvers (HR + boss).
  const approvers = await prisma.user.findMany({ where: { role: { in: ["HR_ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
  await Promise.all(
    approvers.map((a) =>
      notify(prisma, { userId: a.id, type: "REWARD_APPROVED", title: "Reward redemption pending", body: `${user.name} requested ${reward.name}.`, link: "/rewards" }),
    ),
  );
  revalidatePath("/rewards");
}

/** Reward store item management (Boss / HR Admin only). */
export type RewardResult = { ok: true } | { ok: false; error: string };

const REWARD_CATEGORIES = [
  "CASH_VOUCHER", "MEAL_VOUCHER", "EXTRA_LEAVE", "COMPANY_GIFT", "TRAINING",
  "LUCKY_DRAW", "MYSTERY_GIFT", "ANNUAL_DINNER", "PROMOTION_BADGE", "RECOGNITION",
];

type RewardInput = {
  name: string;
  description: string;
  category: string;
  pointsCost: number;
  stock: number;
  imageEmoji: string;
  isActive: boolean;
};

function validateReward(input: RewardInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!REWARD_CATEGORIES.includes(input.category)) return "Please choose a valid category.";
  if (!Number.isFinite(input.pointsCost) || input.pointsCost < 0) return "Diamond cost must be 0 or more.";
  if (!Number.isInteger(input.stock) || input.stock < -1) return "Stock must be -1 (unlimited) or a number ≥ 0.";
  if (!input.imageEmoji.trim()) return "Please pick an emoji/icon.";
  return null;
}

export async function createReward(input: RewardInput): Promise<RewardResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!canManageRewards(session.role)) return { ok: false, error: "Only Boss / HR Admin can manage the reward store." };
  const err = validateReward(input);
  if (err) return { ok: false, error: err };
  await prisma.reward.create({
    data: {
      name: input.name.trim(),
      description: input.description.trim() || null,
      category: input.category,
      pointsCost: Math.round(input.pointsCost),
      stock: input.stock,
      imageEmoji: input.imageEmoji.trim(),
      isActive: input.isActive,
    },
  });
  revalidatePath("/rewards");
  return { ok: true };
}

export async function updateReward(id: string, input: RewardInput): Promise<RewardResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!canManageRewards(session.role)) return { ok: false, error: "Only Boss / HR Admin can manage the reward store." };
  const err = validateReward(input);
  if (err) return { ok: false, error: err };
  const existing = await prisma.reward.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Reward not found." };
  await prisma.reward.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description.trim() || null,
      category: input.category,
      pointsCost: Math.round(input.pointsCost),
      stock: input.stock,
      imageEmoji: input.imageEmoji.trim(),
      isActive: input.isActive,
    },
  });
  revalidatePath("/rewards");
  return { ok: true };
}

export async function deleteReward(id: string): Promise<RewardResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!canManageRewards(session.role)) return { ok: false, error: "Only Boss / HR Admin can manage the reward store." };
  // Keep redemption history intact: if anyone has ever redeemed this reward,
  // deactivate instead of hard-deleting so past records stay valid.
  const redemptions = await prisma.rewardRedemption.count({ where: { rewardId: id } });
  if (redemptions > 0) {
    await prisma.reward.update({ where: { id }, data: { isActive: false } });
    revalidatePath("/rewards");
    return { ok: false, error: "This reward has redemption history, so it was hidden (deactivated) instead of deleted to keep records intact." };
  }
  await prisma.reward.delete({ where: { id } });
  revalidatePath("/rewards");
  return { ok: true };
}

export async function decideRedemption(redemptionId: string, approve: boolean) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const redemption = await prisma.rewardRedemption.findUnique({ where: { id: redemptionId }, include: { reward: true, user: true } });
  if (!redemption || redemption.status !== "PENDING") return;

  // Boss/HR approve anyone; a department head may approve only their own dept.
  const isDeptHead = session.role === "DEPARTMENT_HEAD" && redemption.user.departmentId === session.departmentId;
  if (!canManageRewards(session.role) && !isDeptHead) throw new Error("Forbidden");

  if (approve) {
    const user = await prisma.user.findUnique({ where: { id: redemption.userId } });
    if (!user || user.currentPoints < redemption.pointsSpent) {
      // Not enough points anymore — reject instead.
      await prisma.rewardRedemption.update({ where: { id: redemptionId }, data: { status: "REJECTED", note: "Insufficient points at approval time", decidedById: session.id, decidedAt: new Date() } });
      revalidatePath("/rewards");
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.rewardRedemption.update({ where: { id: redemptionId }, data: { status: "APPROVED", decidedById: session.id, decidedAt: new Date() } });
      await awardPoints(tx, {
        userId: redemption.userId,
        amount: -redemption.pointsSpent,
        type: "REDEMPTION",
        transactionType: "REDEEM",
        sourceType: "REWARD",
        reason: `Redeemed: ${redemption.reward.name}`,
        refType: "REWARD",
        refId: redemption.rewardId,
        approvedBy: session.id,
      });
      // Decrement finite stock (-1 = unlimited).
      if (redemption.reward.stock > 0) {
        await tx.reward.update({ where: { id: redemption.rewardId }, data: { stock: { decrement: 1 } } });
      }
      await notify(tx, { userId: redemption.userId, type: "REWARD_APPROVED", title: "Reward approved 🎉", body: `${redemption.reward.name} — ${redemption.pointsSpent} pts deducted.`, link: "/wallet" });
    });
  } else {
    await prisma.rewardRedemption.update({ where: { id: redemptionId }, data: { status: "REJECTED", decidedById: session.id, decidedAt: new Date() } });
    await notify(prisma, { userId: redemption.userId, type: "REWARD_REJECTED", title: "Reward request declined", body: redemption.reward.name, link: "/rewards" });
  }
  revalidatePath("/rewards");
}
