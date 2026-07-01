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
        reason: `Redeemed: ${redemption.reward.name}`,
        refType: "REWARD",
        refId: redemption.rewardId,
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
