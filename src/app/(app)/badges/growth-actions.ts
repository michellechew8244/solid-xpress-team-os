"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { awardPoints } from "@/lib/points";
import { notify } from "@/lib/notify";
import {
  createLevelUpgradeRequest, approveLevelUpgrade, rejectLevelUpgrade,
} from "@/services/growth";

async function actor() {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  return s;
}

function canSeeTeamGrowth(role: string) {
  return isBoss(role) || role === "HR_ADMIN" || role === "DEPARTMENT_HEAD";
}

/** Staff requests to level up once they've met every requirement. */
export async function requestLevelUpgrade() {
  const me = await actor();
  const result = await createLevelUpgradeRequest(me.id);
  revalidatePath("/badges");
  return { autoApproved: result.autoApproved, toLevel: result.toLevel, toLevelName: result.toLevelName };
}

export async function approveLevelUpgradeAction(requestId: string) {
  const me = await actor();
  if (!canSeeTeamGrowth(me.role)) throw new Error("Forbidden");
  await approveLevelUpgrade(requestId, me.id);
  revalidatePath("/badges");
}

export async function rejectLevelUpgradeAction(requestId: string, reason: string) {
  const me = await actor();
  if (!canSeeTeamGrowth(me.role)) throw new Error("Forbidden");
  await rejectLevelUpgrade(requestId, me.id, reason || "Please keep working on the requirements.");
  revalidatePath("/badges");
}

/** Staff marks a manual (self-reported) mission as started. */
export async function startMission(missionId: string) {
  const me = await actor();
  const mission = await prisma.levelMission.findUnique({ where: { id: missionId } });
  if (!mission) throw new Error("Mission not found");
  await prisma.userLevelMission.upsert({
    where: { userId_missionId: { userId: me.id, missionId } },
    create: { userId: me.id, missionId, status: "IN_PROGRESS", progressValue: 0, targetValue: mission.targetValue },
    update: { status: "IN_PROGRESS" },
  });
  revalidatePath("/badges");
}

/** Staff self-completes a manual mission — awards points (+ badge if configured), once. */
export async function completeMission(missionId: string) {
  const me = await actor();
  const mission = await prisma.levelMission.findUnique({ where: { id: missionId } });
  if (!mission) throw new Error("Mission not found");
  if (mission.missionType !== "MANUAL") throw new Error("This mission tracks itself automatically.");

  const existing = await prisma.userLevelMission.findUnique({ where: { userId_missionId: { userId: me.id, missionId } } });
  if (existing?.status === "COMPLETED") return;

  await prisma.userLevelMission.upsert({
    where: { userId_missionId: { userId: me.id, missionId } },
    create: { userId: me.id, missionId, status: "COMPLETED", progressValue: mission.targetValue, targetValue: mission.targetValue, completedAt: new Date() },
    update: { status: "COMPLETED", progressValue: mission.targetValue, completedAt: new Date() },
  });

  if (mission.pointsReward > 0) {
    await awardPoints(prisma, { userId: me.id, amount: mission.pointsReward, type: "MANUAL", reason: `Mission completed: ${mission.title}`, refType: "LEVEL_MISSION", refId: mission.id });
  }
  if (mission.badgeRewardId) {
    const already = await prisma.userBadge.findUnique({ where: { userId_badgeId: { userId: me.id, badgeId: mission.badgeRewardId } } });
    if (!already) await prisma.userBadge.create({ data: { userId: me.id, badgeId: mission.badgeRewardId, note: `Earned via mission: ${mission.title}` } });
  }
  await notify(prisma, { userId: me.id, type: "LEVEL_MISSION_COMPLETE", title: "Mission completed! 🏁", body: mission.title, link: "/badges" });
  revalidatePath("/badges");
}

/** Manager sends a coaching nudge toward the staff member's next level. */
export async function coachToNextLevel(staffId: string, message: string) {
  const me = await actor();
  if (!canSeeTeamGrowth(me.role)) throw new Error("Forbidden");
  await notify(prisma, { userId: staffId, type: "COACHING_ASSIGNED", title: `Coaching note from ${me.name}`, body: message || "Keep pushing toward your next level!", link: "/badges" });
}
