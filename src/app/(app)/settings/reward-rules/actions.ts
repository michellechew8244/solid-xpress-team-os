"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export async function updateRewardRules(formData: FormData) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only Owner/Management can change reward rules.");
  const bool = (k: string) => formData.get(k) === "on" || formData.get(k) === "true";
  const int = (k: string, d: number) => Math.max(0, Math.round(Number(formData.get(k) ?? d)));

  const data = {
    streakEnabled: bool("streakEnabled"),
    streakDay3: int("streakDay3", 10),
    streakDay7: int("streakDay7", 25),
    streakDay14: int("streakDay14", 50),
    streakDay30: int("streakDay30", 100),
    dailySpinEnabled: bool("dailySpinEnabled"),
    spinPrizeCommon: int("spinPrizeCommon", 2),
    spinPrizeUncommon: int("spinPrizeUncommon", 5),
    spinPrizeRare: int("spinPrizeRare", 10),
    spinPrizeJackpot: int("spinPrizeJackpot", 20),
    proposalAcceptedReward: int("proposalAcceptedReward", 100),
    proposalImplementedReward: int("proposalImplementedReward", 300),
    updatedById: s.id,
  };
  await prisma.rewardRuleSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
  await logAudit(prisma, { action: "REWARD_RULES_CHANGED", entityId: "singleton", entityType: "REWARD_RULES", performedBy: s.id, newValue: data });
  revalidatePath("/settings/reward-rules");
}
