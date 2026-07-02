"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { awardOnboardingDiamonds, getOnboardingSetting } from "@/lib/onboarding-bonus";

function canManage(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

export async function addChecklistItem(formData: FormData) {
  const s = await getSession();
  if (!s || !canManage(s.role)) throw new Error("Forbidden");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!title) throw new Error("Title is required.");
  const count = await prisma.onboardingTemplateItem.count();
  await prisma.onboardingTemplateItem.create({ data: { title, description, order: count } });
  revalidatePath("/onboarding");
}

export async function toggleChecklistItemActive(itemId: string) {
  const s = await getSession();
  if (!s || !canManage(s.role)) throw new Error("Forbidden");
  const item = await prisma.onboardingTemplateItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  await prisma.onboardingTemplateItem.update({ where: { id: itemId }, data: { active: !item.active } });
  revalidatePath("/onboarding");
}

/** Recompute a staff member's onboarding progress %, and trigger the diamond
 * bonus when the checklist reaches 100% and the bonus timing is set to
 * "on onboarding completion" (awardOnboardingDiamonds is dedupe-guarded). */
async function refreshProgress(userId: string, actorId: string) {
  const [items, done] = await Promise.all([
    prisma.onboardingTemplateItem.count({ where: { active: true } }),
    prisma.onboardingItemStatus.count({ where: { userId, item: { active: true } } }),
  ]);
  const progress = items === 0 ? 0 : Math.round((done / items) * 100);
  await prisma.staffProfile.updateMany({ where: { userId }, data: { onboardingProgress: progress } });

  if (items > 0 && done >= items) {
    await logAudit(prisma, { action: "ONBOARDING_COMPLETED", entityId: userId, entityType: "ONBOARDING", performedBy: actorId, affectedUserId: userId, newValue: { items, progress: 100 } });
    await notify(prisma, { userId, type: "ANNOUNCEMENT", title: "🎓 Onboarding complete!", body: "You have completed all onboarding steps. Welcome aboard!", link: "/onboarding" });
    const setting = await getOnboardingSetting();
    if (setting.enabled && setting.timing === "ON_ONBOARDING_COMPLETION") {
      await awardOnboardingDiamonds(userId, actorId);
    }
  }
  return progress;
}

/** HR/Boss ticks or unticks a checklist step for a staff member. */
export async function toggleStaffItem(userId: string, itemId: string) {
  const s = await getSession();
  if (!s || !canManage(s.role)) throw new Error("Forbidden");
  const existing = await prisma.onboardingItemStatus.findUnique({ where: { userId_itemId: { userId, itemId } } });
  if (existing) await prisma.onboardingItemStatus.delete({ where: { id: existing.id } });
  else await prisma.onboardingItemStatus.create({ data: { userId, itemId, doneById: s.id } });
  await refreshProgress(userId, s.id);
  revalidatePath("/onboarding");
}
