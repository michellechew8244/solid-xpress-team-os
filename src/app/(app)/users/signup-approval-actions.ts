"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { awardOnboardingDiamonds, getOnboardingSetting } from "@/lib/onboarding-bonus";

/** Management approves a self-signup: the account becomes usable (and the
 * onboarding welcome bonus fires per the configured rule). */
export async function approveSignup(userId: string) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only Management can approve sign-ups.");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || u.signupStatus !== "PENDING") throw new Error("This sign-up is not pending.");

  await prisma.user.update({
    where: { id: userId },
    data: { signupStatus: "APPROVED", accessStatus: "ACTIVE", isActive: true, updatedBy: s.id, createdBy: u.createdBy ?? s.id },
  });
  await logAudit(prisma, { action: "SIGNUP_APPROVED", entityId: userId, entityType: "USER", performedBy: s.id, actorName: s.name, affectedUserId: userId, newValue: { email: u.email } });
  await notify(prisma, { userId, type: "ANNOUNCEMENT", title: "🎉 Your account has been approved!", body: "Welcome to Solid Xpress Team OS — you can now log in and start earning diamonds.", link: "/dashboard" });

  // Welcome diamonds per the onboarding-bonus rule (dedupe-guarded).
  const setting = await getOnboardingSetting();
  if (setting.enabled && setting.timing === "ON_USER_CREATION") {
    await awardOnboardingDiamonds(userId, s.id);
  }
  revalidatePath("/users");
}

/** Management rejects a self-signup (account stays locked; reason recorded). */
export async function rejectSignup(userId: string, reason: string) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only Management can reject sign-ups.");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || u.signupStatus !== "PENDING") throw new Error("This sign-up is not pending.");

  await prisma.user.update({ where: { id: userId }, data: { signupStatus: "REJECTED", updatedBy: s.id } });
  await logAudit(prisma, { action: "SIGNUP_REJECTED", entityId: userId, entityType: "USER", performedBy: s.id, actorName: s.name, affectedUserId: userId, newValue: { reason } });
  revalidatePath("/users");
}
