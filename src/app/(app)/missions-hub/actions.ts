"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { awardPoints } from "@/lib/points";
import { currentWindow, missionProgress, MISSION_CATEGORIES, MISSION_TYPES, STARTER_MISSIONS } from "@/lib/missions";

function canManage(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

/** Claim a completed mission's reward — once per mission per period, DB-enforced. */
export async function claimMission(missionId: string) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const mission = await prisma.mission.findUnique({ where: { id: missionId } });
  if (!mission || !mission.isActive) throw new Error("Mission not found.");

  const w = currentWindow(mission.missionType);
  const progress = await missionProgress(s.id, mission.category, w);
  if (progress < mission.targetValue) throw new Error(`Not there yet — ${progress}/${mission.targetValue} done.`);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.missionClaim.create({ data: { missionId, userId: s.id, periodKey: w.periodKey, progress, diamondsAwarded: mission.diamondReward } });
      if (mission.diamondReward > 0) {
        await awardPoints(tx, {
          userId: s.id, amount: mission.diamondReward, type: "BONUS", transactionType: "EARN", sourceType: "MISSION_COMPLETION",
          reason: `Mission completed: ${mission.title}`, refType: "MISSION", refId: `${missionId}-${w.periodKey}`,
        });
      }
      // Optional lucky-draw entries into the most recent active campaign.
      if (mission.luckyDrawEntries > 0) {
        const campaign = await tx.luckyDrawCampaign.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
        if (campaign) {
          await tx.luckyDrawEntry.create({ data: { campaignId: campaign.id, userId: s.id, entryCount: mission.luckyDrawEntries, sourceType: "MANUAL", celebrated: false } });
        }
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("You already claimed this mission for the current period.");
    }
    throw e;
  }
  await logAudit(prisma, { action: "MISSION_CLAIMED", entityId: missionId, entityType: "MISSION", performedBy: s.id, affectedUserId: s.id, newValue: { periodKey: w.periodKey, progress, diamonds: mission.diamondReward } });
  await notify(prisma, { userId: s.id, type: "POINTS_AWARDED", title: `🎯 Mission completed: ${mission.title}`, body: `You earned ${mission.diamondReward} diamonds from mission completion.`, link: "/missions-hub" });
  revalidatePath("/missions-hub");
  return { diamonds: mission.diamondReward };
}

/** Boss/HR creates a mission. */
export async function createMission(formData: FormData) {
  const s = await getSession();
  if (!s || !canManage(s.role)) throw new Error("Only Boss/HR can create missions.");
  const title = String(formData.get("title") ?? "").trim();
  const missionType = String(formData.get("missionType") ?? "DAILY");
  const category = String(formData.get("category") ?? "ATTENDANCE");
  if (!title) throw new Error("Mission title is required.");
  if (!MISSION_TYPES[missionType] || !MISSION_CATEGORIES[category]) throw new Error("Invalid mission type/category.");
  await prisma.mission.create({
    data: {
      title, missionType, category,
      description: String(formData.get("description") ?? "") || null,
      targetValue: Math.max(1, Math.round(Number(formData.get("targetValue") ?? 1))),
      diamondReward: Math.max(0, Math.round(Number(formData.get("diamondReward") ?? 10))),
      luckyDrawEntries: Math.max(0, Math.round(Number(formData.get("luckyDrawEntries") ?? 0))),
    },
  });
  await logAudit(prisma, { action: "MISSION_CREATED", entityId: title, entityType: "MISSION", performedBy: s.id });
  revalidatePath("/missions-hub");
}

export async function toggleMission(missionId: string, active: boolean) {
  const s = await getSession();
  if (!s || !canManage(s.role)) throw new Error("Forbidden");
  await prisma.mission.update({ where: { id: missionId }, data: { isActive: active } });
  revalidatePath("/missions-hub");
}

/** One-click starter set for a fresh install (only when no missions exist). */
export async function seedStarterMissions() {
  const s = await getSession();
  if (!s || !canManage(s.role)) throw new Error("Forbidden");
  const count = await prisma.mission.count();
  if (count > 0) throw new Error("Missions already exist.");
  await prisma.mission.createMany({ data: STARTER_MISSIONS.map((m) => ({ ...m })) });
  await logAudit(prisma, { action: "MISSIONS_SEEDED", entityId: "starter", entityType: "MISSION", performedBy: s.id, newValue: { count: STARTER_MISSIONS.length } });
  revalidatePath("/missions-hub");
}

/** Owner-only Mystery Bonus: individual / department / all staff / random pick. */
export async function issueMysteryBonus(formData: FormData) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Owner can issue a Mystery Bonus.");
  const bonusType = String(formData.get("bonusType") ?? "INDIVIDUAL");
  const amount = Math.max(1, Math.round(Number(formData.get("amount") ?? 0)));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("Give the bonus a reason — mystery, not confusion.");

  const eligible = { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true };
  let targets: { id: string }[] = [];
  if (bonusType === "INDIVIDUAL") {
    const userId = String(formData.get("userId") ?? "");
    if (!userId) throw new Error("Pick a staff member.");
    targets = [{ id: userId }];
  } else if (bonusType === "DEPARTMENT") {
    const departmentId = String(formData.get("departmentId") ?? "");
    if (!departmentId) throw new Error("Pick a department.");
    targets = await prisma.user.findMany({ where: { ...eligible, departmentId }, select: { id: true } });
  } else if (bonusType === "ALL_STAFF") {
    targets = await prisma.user.findMany({ where: eligible, select: { id: true } });
  } else if (bonusType === "RANDOM") {
    const pool = await prisma.user.findMany({ where: eligible, select: { id: true } });
    if (pool.length === 0) throw new Error("No eligible staff.");
    targets = [pool[Math.floor(Math.random() * pool.length)]];
  } else {
    throw new Error("Invalid bonus type.");
  }
  if (targets.length === 0) throw new Error("No recipients matched.");

  for (const t of targets) {
    await awardPoints(prisma, {
      userId: t.id, amount, type: "BONUS", transactionType: "OWNER_GENERATE", sourceType: "MYSTERY_BONUS",
      reason: `🎁 Mystery Bonus: ${reason}`, generatedBy: s.id, approvedBy: s.id,
    });
    await notify(prisma, { userId: t.id, type: "POINTS_AWARDED", title: `🎁 Mystery Bonus! +${amount} 💎`, body: reason, link: "/wallet" });
  }
  await logAudit(prisma, { action: "MYSTERY_BONUS_ISSUED", entityId: bonusType, entityType: "DIAMOND", performedBy: s.id, newValue: { bonusType, amount, recipients: targets.length, reason } });
  revalidatePath("/owner/diamonds");
  return { recipients: targets.length, amount };
}
