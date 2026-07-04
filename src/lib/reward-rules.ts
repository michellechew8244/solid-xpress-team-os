import { prisma } from "./prisma";

/**
 * Central reward-rule settings (Owner/Management-configurable). Replaces the
 * previously hardcoded streak / daily-spin / proposal reward amounts.
 */
export async function getRewardRuleSetting() {
  return prisma.rewardRuleSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
}

export type RewardRuleT = Awaited<ReturnType<typeof getRewardRuleSetting>>;

/** Streak milestone → diamond bonus map, from settings. */
export function streakMilestones(s: RewardRuleT): Record<number, number> {
  return { 3: s.streakDay3, 7: s.streakDay7, 14: s.streakDay14, 30: s.streakDay30 };
}

/** Weighted daily-spin prize pool (server draw), from settings. */
export function spinPrizes(s: RewardRuleT): { value: number; weight: number }[] {
  return [
    { value: s.spinPrizeCommon, weight: 50 },
    { value: s.spinPrizeUncommon, weight: 30 },
    { value: s.spinPrizeRare, weight: 15 },
    { value: s.spinPrizeJackpot, weight: 5 },
  ];
}

/** 8-segment wheel display values (client), from settings. */
export function spinWheelValues(s: RewardRuleT): number[] {
  const c = s.spinPrizeCommon, u = s.spinPrizeUncommon, r = s.spinPrizeRare, j = s.spinPrizeJackpot;
  return [c, u, c, r, c, u, j, u];
}
