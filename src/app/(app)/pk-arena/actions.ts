"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { awardPoints } from "@/lib/points";
import { individualStandings, departmentStandings, PK_METRICS } from "@/lib/pk";

function canManage(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

export async function createPKCampaign(formData: FormData) {
  const s = await getSession();
  if (!s || !canManage(s.role)) throw new Error("Only Boss/HR can create PK campaigns.");
  const title = String(formData.get("title") ?? "").trim();
  const pkType = String(formData.get("pkType") ?? "INDIVIDUAL");
  const metricType = String(formData.get("metricType") ?? "DIAMONDS");
  const startDate = new Date(String(formData.get("startDate") ?? ""));
  const endDate = new Date(String(formData.get("endDate") ?? ""));
  if (!title) throw new Error("Give the campaign a title.");
  if (!["INDIVIDUAL", "DEPARTMENT"].includes(pkType)) throw new Error("Invalid PK type.");
  if (!PK_METRICS[metricType]) throw new Error("Invalid metric.");
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) throw new Error("Set a valid start and end date.");

  const c = await prisma.pKCampaign.create({
    data: {
      title, pkType, metricType, startDate, endDate,
      description: String(formData.get("description") ?? "") || null,
      rewardFirstPlace: Math.max(0, Number(formData.get("rewardFirstPlace") ?? 300)),
      rewardSecondPlace: Math.max(0, Number(formData.get("rewardSecondPlace") ?? 200)),
      rewardThirdPlace: Math.max(0, Number(formData.get("rewardThirdPlace") ?? 100)),
      teamReward: Math.max(0, Number(formData.get("teamReward") ?? 150)),
      status: startDate > new Date() ? "UPCOMING" : "ACTIVE",
      createdBy: s.id,
    },
  });
  await logAudit(prisma, { action: "PK_CAMPAIGN_CREATED", entityId: c.id, entityType: "PK", performedBy: s.id, newValue: { title, pkType, metricType } });
  revalidatePath("/pk-arena");
  revalidatePath("/pk-arena/campaigns");
}

export async function cancelPKCampaign(campaignId: string) {
  const s = await getSession();
  if (!s || !canManage(s.role)) throw new Error("Forbidden");
  await prisma.pKCampaign.update({ where: { id: campaignId }, data: { status: "CANCELLED" } });
  await logAudit(prisma, { action: "PK_CAMPAIGN_CANCELLED", entityId: campaignId, entityType: "PK", performedBy: s.id });
  revalidatePath("/pk-arena");
  revalidatePath("/pk-arena/campaigns");
}

/**
 * Boss finalizes a campaign: standings are computed from real records, PKResult
 * rows written, and winners paid. Red-line staff are skipped (next eligible
 * takes the podium) unless the Boss chooses override.
 */
export async function finalizePKCampaign(campaignId: string, ownerOverride: boolean) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Boss can finalize a PK campaign.");
  const c = await prisma.pKCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.status === "COMPLETED" || c.status === "CANCELLED") throw new Error("Campaign is not active.");

  if (c.pkType === "INDIVIDUAL") {
    const standings = await individualStandings(c.metricType, c.startDate, c.endDate);
    const podium = (ownerOverride ? standings : standings.filter((x) => x.eligible)).filter((x) => x.score > 0).slice(0, 3);
    const rewards = [c.rewardFirstPlace, c.rewardSecondPlace, c.rewardThirdPlace];
    for (let i = 0; i < podium.length; i++) {
      const w = podium[i];
      const amount = rewards[i] ?? 0;
      await prisma.pKResult.create({ data: { campaignId, winnerUserId: w.userId, rank: i + 1, finalScore: w.score, diamondsAwarded: amount } });
      if (amount > 0) {
        await awardPoints(prisma, {
          userId: w.userId, amount, type: "BONUS", transactionType: "EARN", sourceType: "PK_WINNER",
          reason: `🏆 ${c.title} — rank #${i + 1}`, refType: "PK", refId: `${campaignId}-${i + 1}`,
        });
        await notify(prisma, { userId: w.userId, type: "POINTS_AWARDED", title: `🏆 Congratulations! You won ${c.title}`, body: `Rank #${i + 1} — you earned ${amount} diamonds.`, link: "/pk-arena" });
      }
    }
  } else {
    const standings = await departmentStandings(c.metricType, c.startDate, c.endDate);
    const winner = standings.find((x) => x.score > 0);
    if (winner) {
      await prisma.pKResult.create({ data: { campaignId, winnerDepartmentId: winner.departmentId, rank: 1, finalScore: winner.score, diamondsAwarded: c.teamReward } });
      const members = await prisma.user.findMany({ where: { departmentId: winner.departmentId, isActive: true, role: { in: ["STAFF", "DEPARTMENT_HEAD"] } }, select: { id: true } });
      const redLines = ownerOverride ? [] : await prisma.coachingRecord.findMany({ where: { triggeredBy: "RED_LINE", status: { not: "RESOLVED" } }, select: { staffId: true } });
      const flagged = new Set(redLines.map((r) => r.staffId));
      for (const m of members) {
        if (flagged.has(m.id)) continue;
        if (c.teamReward > 0) {
          await awardPoints(prisma, {
            userId: m.id, amount: c.teamReward, type: "BONUS", transactionType: "EARN", sourceType: "TEAM_PK_WINNER",
            reason: `🏆 ${c.title} — department champion (${winner.name})`, refType: "PK", refId: `${campaignId}-${m.id}`,
          });
          await notify(prisma, { userId: m.id, type: "POINTS_AWARDED", title: `🏆 ${winner.name} won ${c.title}!`, body: `Every member earns ${c.teamReward} diamonds.`, link: "/pk-arena" });
        }
      }
    }
  }

  await prisma.pKCampaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
  await logAudit(prisma, { action: "PK_CAMPAIGN_FINALIZED", entityId: campaignId, entityType: "PK", performedBy: s.id, newValue: { ownerOverride } });
  revalidatePath("/pk-arena");
  revalidatePath("/pk-arena/campaigns");
}
