"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canApproveTasks, isBoss } from "@/lib/rbac";
import { awardPoints } from "@/lib/points";
import { notify } from "@/lib/notify";

function canAwardBadges(role: string) {
  return isBoss(role) || role === "HR_ADMIN" || role === "DEPARTMENT_HEAD";
}

/**
 * Award a badge to a staff member (spec Task 9.2). Records the UserBadge,
 * credits the badge bonus points, grants lucky-draw entries (2 per approved
 * badge, per §6A), and notifies the recipient. Idempotent per user+badge.
 */
export async function awardBadge(formData: FormData) {
  const session = await getSession();
  if (!session || !canAwardBadges(session.role)) throw new Error("Forbidden");

  const userId = String(formData.get("userId") ?? "");
  const badgeId = String(formData.get("badgeId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!userId || !badgeId) return;

  const [badge, staff] = await Promise.all([
    prisma.badge.findUnique({ where: { id: badgeId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!badge || !staff) throw new Error("Not found");

  // Department heads can only award within their own department.
  if (session.role === "DEPARTMENT_HEAD" && staff.departmentId !== session.departmentId) {
    throw new Error("You can only award badges to your own department.");
  }

  const already = await prisma.userBadge.findUnique({ where: { userId_badgeId: { userId, badgeId } } });
  if (already) throw new Error(`${staff.name} already has the ${badge.name} badge.`);

  await prisma.$transaction(async (tx) => {
    await tx.userBadge.create({ data: { userId, badgeId, awardedBy: session.id, note: reason || null } });
    if (badge.pointsBonus > 0) {
      await awardPoints(tx, { userId, amount: badge.pointsBonus, type: "MANUAL", reason: `Badge earned: ${badge.name}`, refType: "BADGE", refId: badge.id });
    }
    await notify(tx, { userId, type: "BADGE_EARNED", title: `🏅 New badge: ${badge.name}`, body: `+${badge.pointsBonus} bonus points${reason ? ` — ${reason}` : ""}`, link: "/badges" });
  });

  // Grant 2 lucky-draw entries in the active campaign (spec §6A).
  const campaign = await prisma.luckyDrawCampaign.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  if (campaign) {
    await prisma.luckyDrawEntry.create({ data: { campaignId: campaign.id, userId, entryCount: 2, sourceType: "BADGE", sourceId: badge.id } });
  }

  revalidatePath("/badges");
  revalidatePath("/wallet");
}

// Re-exported so the badges page can gate the UI without importing rbac twice.
export async function canCurrentUserAwardBadges() {
  const session = await getSession();
  return !!session && (canApproveTasks(session.role) || session.role === "HR_ADMIN");
}
