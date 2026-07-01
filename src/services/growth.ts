import { prisma } from "@/lib/prisma";
import { awardPoints } from "@/lib/points";
import { notify } from "@/lib/notify";
import { currentPeriod } from "@/lib/enums";
import type { Prisma, LevelRule, User } from "@prisma/client";

// Local copy of rbac.isBoss — avoids pulling in lib/rbac -> lib/auth's
// "server-only" guard, which would make this otherwise-plain service module
// unusable outside the Next.js server runtime (e.g. from scripts/tests).
function isBoss(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGEMENT";
}

/**
 * Growth Roadmap service — the gated leveling system that sits alongside the
 * legacy points-only `growthLevel` field. A user's real "current level" for
 * the roadmap is `User.officialLevel`, which only changes via an approved
 * LevelUpgradeRequest (see approveLevelUpgrade below), not just by crossing a
 * points threshold.
 *
 * Design notes on a few criteria with no dedicated historical table (called
 * out here rather than silently approximated):
 *  - "Top 3 in department at least once" (Lv4) checks the department's
 *    CURRENT points ranking (no ranking-history table exists).
 *  - "Quarterly/annual champion recognition" (Lv7) is proxied by having won a
 *    QUARTERLY_CHAMPION or ANNUAL_MEGA lucky-draw prize.
 *  - "Special contribution record" is proxied by PointsTransaction rows whose
 *    reason starts with "Recognition:" (how points-admin's recognition form
 *    already labels them).
 *  - "Daily report discipline %" is the share of the last 30 days that have a
 *    submitted daily report.
 * These flavour criteria are level-specific one-offs, so they're implemented
 * as fixed business logic here rather than as generic LevelRule columns.
 */

const GRADE_ORDER = ["E", "D", "C", "B", "A", "A_PLUS"];
function gradeRank(grade: string | null | undefined): number {
  if (!grade) return -1;
  return GRADE_ORDER.indexOf(grade);
}
function gradeMeets(actual: string | null | undefined, required: string | null | undefined): boolean {
  if (!required) return true;
  return gradeRank(actual) >= gradeRank(required);
}

export interface ChecklistItem {
  key: string;
  label: string;
  requiredLabel: string;
  currentLabel: string;
  met: boolean;
  progressPct: number; // 0..100, for the progress bar
}

export interface LevelProgress {
  userId: string;
  currentLevel: number;
  currentLevelName: string;
  targetLevel: number | null; // the level this progress object is measured against
  targetLevelName: string | null;
  lifetimePoints: number;
  badgeCount: number;
  latestGrade: string | null;
  progressPercent: number; // toward the target level, based on points (headline number)
  isReadyToUpgrade: boolean;
  missing: string[]; // human-readable unmet requirements
  checklist: ChecklistItem[];
  rule: LevelRule | null;
}

export async function getLevelRules() {
  return prisma.levelRule.findMany({ where: { isActive: true }, orderBy: { levelNumber: "asc" } });
}

interface UserSignals {
  badgeCount: number;
  badgeNames: Set<string>;
  latestReview: { finalGrade: string | null; period: string } | null;
  recentReviews: { finalGrade: string | null; period: string }[]; // most recent first, up to 3
  teamworkCount: number;
  specialContribCount: number;
  redLineEver: boolean;
  penaltyThisMonth: number;
  penaltyLast6Months: number;
  topThreeInDept: boolean;
  championWin: boolean;
  dailyReportPct: number;
}

/** Gather every signal needed to evaluate ANY level's checklist for this user, once. */
async function gatherUserSignals(userId: string, user: User): Promise<UserSignals> {
  const period = currentPeriod();
  const [userBadges, latestReview, recentReviews, teamworkCount, specialContribCount, redLineEver, penaltyThisMonth, penaltyLast6Months, deptRanking, championWin, dailyReportPct] =
    await Promise.all([
      prisma.userBadge.findMany({ where: { userId }, include: { badge: true } }),
      prisma.performanceReview.findFirst({ where: { staffId: userId }, orderBy: { period: "desc" } }),
      prisma.performanceReview.findMany({ where: { staffId: userId }, orderBy: { period: "desc" }, take: 3 }),
      prisma.pointsTransaction.count({ where: { userId, type: "TEAMWORK", amount: { gt: 0 } } }),
      prisma.pointsTransaction.count({ where: { userId, reason: { startsWith: "Recognition:" } } }),
      prisma.coachingRecord.findFirst({ where: { staffId: userId, triggeredBy: "RED_LINE" } }),
      prisma.pointsTransaction.count({ where: { userId, type: "PENALTY", period } }),
      prisma.pointsTransaction.count({ where: { userId, type: "PENALTY", createdAt: { gte: new Date(Date.now() - 182 * 24 * 60 * 60 * 1000) } } }),
      user.departmentId
        ? prisma.user.findMany({ where: { departmentId: user.departmentId, isActive: true }, orderBy: { currentPoints: "desc" }, select: { id: true } })
        : Promise.resolve([]),
      prisma.luckyDrawPrize.findFirst({ where: { winnerUserId: userId, campaign: { campaignType: { in: ["QUARTERLY_CHAMPION", "ANNUAL_MEGA"] } } } }),
      dailyReportDisciplinePct(userId),
    ]);

  return {
    badgeCount: userBadges.length,
    badgeNames: new Set(userBadges.map((b) => b.badge.name)),
    latestReview: latestReview ? { finalGrade: latestReview.finalGrade, period: latestReview.period } : null,
    recentReviews: recentReviews.map((r) => ({ finalGrade: r.finalGrade, period: r.period })),
    teamworkCount, specialContribCount, redLineEver: !!redLineEver,
    penaltyThisMonth, penaltyLast6Months,
    topThreeInDept: deptRanking.findIndex((u) => u.id === userId) >= 0 && deptRanking.findIndex((u) => u.id === userId) < 3,
    championWin: !!championWin, dailyReportPct,
  };
}

/** % of the last 30 days that have a submitted daily report. */
async function dailyReportDisciplinePct(userId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const reports = await prisma.dailyReport.findMany({ where: { userId, date: { gte: since } }, select: { date: true } });
  const distinctDays = new Set(reports.map((r) => r.date.toISOString().slice(0, 10)));
  return Math.min(100, Math.round((distinctDays.size / 30) * 100));
}

/** Build the checklist for one specific level rule (works for ANY level, not just "next"). */
function buildChecklistForRule(user: User, rule: LevelRule, signals: UserSignals): { checklist: ChecklistItem[]; missing: string[]; isReady: boolean } {
  const requiredBadgeList = rule.requiredBadgeNames ? rule.requiredBadgeNames.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const hasRequiredBadge = requiredBadgeList.length === 0 || requiredBadgeList.some((n) => signals.badgeNames.has(n));

  const recentSlice = signals.recentReviews.slice(0, rule.requiredConsecutiveGradeMonths);
  const consecutiveGradeOk = (() => {
    if (recentSlice.length < rule.requiredConsecutiveGradeMonths) return false;
    for (let i = 0; i < recentSlice.length; i++) {
      if (!gradeMeets(recentSlice[i].finalGrade, rule.requiredGrade)) return false;
      if (i > 0) {
        const [py, pm] = recentSlice[i - 1].period.split("-").map(Number);
        const [cy, cm] = recentSlice[i].period.split("-").map(Number);
        if (py * 12 + pm - (cy * 12 + cm) !== 1) return false; // must be back-to-back months
      }
    }
    return true;
  })();

  const checklist: ChecklistItem[] = [];
  checklist.push({
    key: "points", label: "Lifetime Points",
    requiredLabel: rule.minLifetimePoints.toLocaleString(), currentLabel: user.lifetimePoints.toLocaleString(),
    met: user.lifetimePoints >= rule.minLifetimePoints,
    progressPct: Math.min(100, Math.round((user.lifetimePoints / Math.max(rule.minLifetimePoints, 1)) * 100)),
  });
  if (rule.minBadgeCount > 0) {
    checklist.push({
      key: "badges", label: "Badges Earned",
      requiredLabel: `${rule.minBadgeCount}`, currentLabel: `${signals.badgeCount}`,
      met: signals.badgeCount >= rule.minBadgeCount,
      progressPct: Math.min(100, Math.round((signals.badgeCount / rule.minBadgeCount) * 100)),
    });
  }
  if (requiredBadgeList.length > 0) {
    checklist.push({
      key: "specificBadge", label: "Required Badge",
      requiredLabel: requiredBadgeList.join(" or "), currentLabel: hasRequiredBadge ? "Held" : "Not yet held",
      met: hasRequiredBadge, progressPct: hasRequiredBadge ? 100 : 0,
    });
  }
  if (rule.requiredGrade) {
    const label = rule.requiredConsecutiveGradeMonths > 1
      ? `${rule.requiredGrade}+ for ${rule.requiredConsecutiveGradeMonths} consecutive months`
      : `${rule.requiredGrade} or above`;
    const met = rule.requiredConsecutiveGradeMonths > 1 ? consecutiveGradeOk : gradeMeets(signals.latestReview?.finalGrade, rule.requiredGrade);
    checklist.push({
      key: "grade", label: "Monthly Grade", requiredLabel: label,
      currentLabel: signals.latestReview?.finalGrade ? signals.latestReview.finalGrade.replace("A_PLUS", "A+") : "No grade yet",
      met, progressPct: met ? 100 : 0,
    });
  }
  if (rule.requiredZeroMistake) {
    const zeroMistakeOk = rule.levelNumber >= 7 ? signals.penaltyLast6Months === 0 : rule.levelNumber === 3 ? signals.penaltyThisMonth === 0 : !signals.redLineEver;
    checklist.push({
      key: "discipline", label: rule.levelNumber >= 7 ? "No Major Penalty (6 months)" : rule.levelNumber === 3 ? "No Penalty This Month" : "No Red-Line Issue",
      requiredLabel: "Passed", currentLabel: zeroMistakeOk ? "Passed" : "Not yet",
      met: zeroMistakeOk, progressPct: zeroMistakeOk ? 100 : 0,
    });
  }
  if (rule.requiredTeamworkCount > 0) {
    checklist.push({
      key: "teamwork", label: "Teamwork Actions",
      requiredLabel: `${rule.requiredTeamworkCount}`, currentLabel: `${signals.teamworkCount}`,
      met: signals.teamworkCount >= rule.requiredTeamworkCount,
      progressPct: Math.min(100, Math.round((signals.teamworkCount / rule.requiredTeamworkCount) * 100)),
    });
  }
  if (rule.requiredSpecialContributionCount > 0) {
    checklist.push({
      key: "contribution", label: "Special Contribution",
      requiredLabel: `${rule.requiredSpecialContributionCount}`, currentLabel: `${signals.specialContribCount}`,
      met: signals.specialContribCount >= rule.requiredSpecialContributionCount,
      progressPct: Math.min(100, Math.round((signals.specialContribCount / rule.requiredSpecialContributionCount) * 100)),
    });
  }
  // Level-specific flavour criteria (see module doc comment).
  if (rule.levelNumber === 2) {
    checklist.push({
      key: "dailyReports", label: "Daily Report Discipline", requiredLabel: "80%", currentLabel: `${signals.dailyReportPct}%`,
      met: signals.dailyReportPct >= 80, progressPct: Math.min(100, Math.round((signals.dailyReportPct / 80) * 100)),
    });
  }
  if (rule.levelNumber === 4) {
    checklist.push({
      key: "topThree", label: "Top 3 in Department", requiredLabel: "Yes", currentLabel: signals.topThreeInDept ? "Currently top 3" : "Not currently",
      met: signals.topThreeInDept, progressPct: signals.topThreeInDept ? 100 : 0,
    });
  }
  if (rule.levelNumber === 7) {
    checklist.push({
      key: "champion", label: "Champion Recognition", requiredLabel: "Yes", currentLabel: signals.championWin ? "Won a champion prize" : "Not yet",
      met: signals.championWin, progressPct: signals.championWin ? 100 : 0,
    });
  }

  const missing = checklist.filter((c) => !c.met).map((c) => `${c.label}: ${c.currentLabel} (need ${c.requiredLabel})`);
  return { checklist, missing, isReady: checklist.every((c) => c.met) };
}

/**
 * Progress against a specific level (defaults to the user's next level).
 * Works for ANY level 2-7, which is what powers the "click any level card"
 * roadmap modal, not just the immediate next one.
 */
export async function calculateLevelProgress(userId: string, targetLevelNumber?: number): Promise<LevelProgress> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const rules = await getLevelRules();
  const currentRule = rules.find((r) => r.levelNumber === user.officialLevel);
  const target = targetLevelNumber ?? user.officialLevel + 1;
  const rule = rules.find((r) => r.levelNumber === target) ?? null;
  const currentLevelName = currentRule?.levelName ?? "New Learner";
  const badgeCountBase = await prisma.userBadge.count({ where: { userId } });

  if (!rule) {
    return {
      userId, currentLevel: user.officialLevel, currentLevelName, targetLevel: null, targetLevelName: null,
      lifetimePoints: user.lifetimePoints, badgeCount: badgeCountBase, latestGrade: null,
      progressPercent: 100, isReadyToUpgrade: false, missing: [], checklist: [], rule: null,
    };
  }

  const signals = await gatherUserSignals(userId, user);
  const { checklist, missing, isReady } = buildChecklistForRule(user, rule, signals);
  const progressPercent = Math.min(100, Math.round((user.lifetimePoints / Math.max(rule.minLifetimePoints, 1)) * 100));

  return {
    userId, currentLevel: user.officialLevel, currentLevelName,
    targetLevel: rule.levelNumber, targetLevelName: rule.levelName,
    lifetimePoints: user.lifetimePoints, badgeCount: signals.badgeCount, latestGrade: signals.latestReview?.finalGrade ?? null,
    progressPercent, isReadyToUpgrade: isReady, // meaningful for any level; only actionable for claiming when targetLevel === currentLevel+1
    missing, checklist, rule,
  };
}

/** Alias — same computation, named per the spec's function list. */
export const getUserLevelProgress = calculateLevelProgress;

export async function getNextLevelRequirements(userId: string) {
  const p = await calculateLevelProgress(userId);
  return { nextLevel: p.targetLevel, nextLevelName: p.targetLevelName, checklist: p.checklist, rule: p.rule };
}

export async function getMissingLevelRequirements(userId: string): Promise<string[]> {
  return (await calculateLevelProgress(userId)).missing;
}

/** Ready to level up means: at the very next level, and every requirement met. */
export async function checkIfReadyToLevelUp(userId: string): Promise<boolean> {
  const p = await calculateLevelProgress(userId);
  return p.targetLevel === p.currentLevel + 1 && p.isReadyToUpgrade;
}

// ---------------------------------------------------------------------------
// Level upgrade request / approval / rejection
// ---------------------------------------------------------------------------

/** Who is allowed to approve a given LevelRule's upgrade (per Section 16/9). */
function canApproveUpgrade(
  actorRole: string,
  actorDepartmentId: string | null,
  targetDepartmentId: string | null,
  rule: { requiresManagerApproval: boolean; requiresHRApproval: boolean; requiresBossApproval: boolean },
): boolean {
  if (isBoss(actorRole)) return true; // Boss/Management can always approve, incl. override
  if (rule.requiresBossApproval) return false;
  if (rule.requiresHRApproval) return actorRole === "HR_ADMIN";
  if (rule.requiresManagerApproval) return actorRole === "DEPARTMENT_HEAD" && actorDepartmentId === targetDepartmentId;
  // No explicit approval tier configured (e.g. Lv2/Lv3) — HR or the staff's own department head may still action it manually.
  return actorRole === "HR_ADMIN" || (actorRole === "DEPARTMENT_HEAD" && actorDepartmentId === targetDepartmentId);
}

/** Staff requests to level up. Auto-approves immediately when no approval tier is required. */
export async function createLevelUpgradeRequest(userId: string) {
  const progress = await calculateLevelProgress(userId); // defaults to current+1
  if (!progress.rule || progress.targetLevel !== progress.currentLevel + 1) throw new Error("No next level available.");
  if (!progress.isReadyToUpgrade) throw new Error("You have not met all requirements for the next level yet.");

  const existing = await prisma.levelUpgradeRequest.findFirst({ where: { userId, status: "PENDING" } });
  if (existing) throw new Error("You already have a pending level upgrade request.");

  const request = await prisma.levelUpgradeRequest.create({
    data: { userId, fromLevel: progress.currentLevel, toLevel: progress.targetLevel, status: "PENDING" },
  });
  await notify(prisma, { userId, type: "LEVEL_UPGRADE_REQUESTED", title: "Level upgrade request submitted", body: `Requesting Lv.${progress.targetLevel} — ${progress.targetLevelName}.`, link: "/badges" });

  const needsApproval = progress.rule.requiresManagerApproval || progress.rule.requiresHRApproval || progress.rule.requiresBossApproval;
  let autoApproved = false;
  if (!needsApproval) {
    // Lv2/Lv3-style — auto-approve immediately.
    await approveLevelUpgrade(request.id, userId, true);
    autoApproved = true;
  } else {
    // Notify the appropriate approver tier.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    let approverWhere: Prisma.UserWhereInput;
    if (progress.rule.requiresBossApproval) {
      approverWhere = { role: { in: ["SUPER_ADMIN", "MANAGEMENT"] } };
    } else if (progress.rule.requiresHRApproval) {
      approverWhere = { role: "HR_ADMIN" };
    } else {
      approverWhere = { role: "DEPARTMENT_HEAD", departmentId: user?.departmentId ?? "__none__" };
    }
    const approvers = await prisma.user.findMany({ where: approverWhere, select: { id: true } });
    await Promise.all(approvers.map((a) => notify(prisma, { userId: a.id, type: "LEVEL_UPGRADE_REQUESTED", title: "Level upgrade needs your approval", body: `${user?.name} requests Lv.${progress.targetLevel} — ${progress.targetLevelName}.`, link: "/badges" })));
  }
  return { request, autoApproved, toLevel: progress.targetLevel, toLevelName: progress.targetLevelName };
}

/** Approve a pending upgrade request. `isSystemAutoApprove` skips the approver-permission check. */
export async function approveLevelUpgrade(requestId: string, approverId: string, isSystemAutoApprove = false) {
  const request = await prisma.levelUpgradeRequest.findUnique({ where: { id: requestId }, include: { user: true } });
  if (!request || request.status !== "PENDING") throw new Error("Request not found or already actioned.");
  if (request.userId === approverId && !isSystemAutoApprove) throw new Error("You cannot approve your own level upgrade.");

  const rule = await prisma.levelRule.findUnique({ where: { levelNumber: request.toLevel } });
  if (!isSystemAutoApprove) {
    const approver = await prisma.user.findUnique({ where: { id: approverId } });
    if (!approver || !rule || !canApproveUpgrade(approver.role, approver.departmentId, request.user.departmentId, rule)) {
      throw new Error("You are not authorised to approve this level.");
    }
  }

  const bonus = rule?.bonusPoints ?? 0;
  await prisma.$transaction(async (tx) => {
    await tx.levelUpgradeRequest.update({ where: { id: requestId }, data: { status: "APPROVED", approvedById: isSystemAutoApprove ? null : approverId, approvedAt: new Date() } });
    await tx.user.update({ where: { id: request.userId }, data: { officialLevel: request.toLevel } });
    await tx.levelHistory.create({
      data: { userId: request.userId, fromLevel: request.fromLevel, toLevel: request.toLevel, reason: `Reached Lv.${request.toLevel} requirements`, approvedById: isSystemAutoApprove ? null : approverId, bonusPointsAwarded: bonus },
    });
    if (bonus > 0) {
      await awardPoints(tx, { userId: request.userId, amount: bonus, type: "MANUAL", reason: `Level upgrade bonus: Lv.${request.toLevel} — ${rule?.levelName}`, refType: "LEVEL", refId: String(request.toLevel) });
    }
  });

  await notify(prisma, {
    userId: request.userId, type: "LEVEL_UPGRADED",
    title: `🎉 You unlocked Lv.${request.toLevel} — ${rule?.levelName}`,
    body: "Congratulations! Keep growing with Solid Xpress.", link: "/badges",
  });
}

export async function rejectLevelUpgrade(requestId: string, approverId: string, reason: string) {
  const request = await prisma.levelUpgradeRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "PENDING") throw new Error("Request not found or already actioned.");
  await prisma.levelUpgradeRequest.update({ where: { id: requestId }, data: { status: "REJECTED", approvedById: approverId, approvedAt: new Date(), rejectionReason: reason } });
  await notify(prisma, { userId: request.userId, type: "LEVEL_UPGRADE_REJECTED", title: "Your level upgrade request needs more improvement", body: reason, link: "/badges" });
}

export async function awardLevelBonusPoints(userId: string, points: number, reason: string) {
  await awardPoints(prisma, { userId, amount: points, type: "MANUAL", reason });
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

/** Recompute progress for auto-tracked missions and award on completion. */
export async function updateUserLevelMissionProgress(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { department: true } });
  if (!user) return;
  const missions = await prisma.levelMission.findMany({
    where: { isActive: true, missionType: { startsWith: "AUTO_" }, OR: [{ departmentEligibility: "ALL" }, { departmentEligibility: user.department?.code ?? "__none__" }] },
  });

  for (const m of missions) {
    let progressValue = 0;
    if (m.missionType === "AUTO_TASKS_ON_TIME") {
      progressValue = await prisma.task.count({ where: { assigneeId: userId, status: "COMPLETED", approvedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } });
    } else if (m.missionType === "AUTO_DAILY_REPORTS") {
      const reports = await prisma.dailyReport.findMany({ where: { userId, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, select: { date: true } });
      progressValue = new Set(reports.map((r) => r.date.toISOString().slice(0, 10))).size;
    } else if (m.missionType === "AUTO_GRADE") {
      const review = await prisma.performanceReview.findFirst({ where: { staffId: userId, period: currentPeriod() } });
      progressValue = review && gradeMeets(review.finalGrade, "B") ? m.targetValue : 0;
    } else if (m.missionType === "AUTO_BADGE") {
      const has = m.badgeRewardId ? await prisma.userBadge.findFirst({ where: { userId, badgeId: m.badgeRewardId } }) : null;
      progressValue = has ? m.targetValue : 0;
    }

    const existing = await prisma.userLevelMission.findUnique({ where: { userId_missionId: { userId, missionId: m.id } } });
    if (existing?.status === "COMPLETED") continue;

    const completed = progressValue >= m.targetValue;
    const status = completed ? "COMPLETED" : progressValue > 0 ? "IN_PROGRESS" : "NOT_STARTED";
    await prisma.userLevelMission.upsert({
      where: { userId_missionId: { userId, missionId: m.id } },
      create: { userId, missionId: m.id, status, progressValue, targetValue: m.targetValue, completedAt: completed ? new Date() : null },
      update: { status, progressValue, completedAt: completed ? new Date() : undefined },
    });

    if (completed && !existing?.completedAt) {
      if (m.pointsReward > 0) await awardPoints(prisma, { userId, amount: m.pointsReward, type: "MANUAL", reason: `Mission completed: ${m.title}`, refType: "LEVEL_MISSION", refId: m.id });
      await notify(prisma, { userId, type: "LEVEL_MISSION_COMPLETE", title: "Mission completed! 🏁", body: m.title, link: "/badges" });
    }
  }
}

/** Missions recommended for the user's next level (creates rows lazily via progress upserts). */
export async function getRecommendedLevelMissions(userId: string) {
  await updateUserLevelMissionProgress(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { department: true } });
  if (!user) return [];
  const targetLevel = Math.min(user.officialLevel + 1, 7);

  const missions = await prisma.levelMission.findMany({
    where: { isActive: true, levelTarget: targetLevel, OR: [{ departmentEligibility: "ALL" }, { departmentEligibility: user.department?.code ?? "__none__" }] },
    include: { badgeReward: true },
    orderBy: { pointsReward: "asc" },
  });

  const progressRows = await prisma.userLevelMission.findMany({ where: { userId, missionId: { in: missions.map((m) => m.id) } } });
  const byMission = new Map(progressRows.map((p) => [p.missionId, p]));

  return missions.map((m) => ({
    id: m.id, title: m.title, description: m.description, pointsReward: m.pointsReward,
    badgeName: m.badgeReward?.name ?? null, difficulty: m.difficulty, missionType: m.missionType,
    status: byMission.get(m.id)?.status ?? "NOT_STARTED",
    progressValue: byMission.get(m.id)?.progressValue ?? 0, targetValue: m.targetValue,
  }));
}

// ---------------------------------------------------------------------------
// Manager team overview
// ---------------------------------------------------------------------------

export async function getTeamGrowthOverview(departmentId: string | null) {
  const users = await prisma.user.findMany({
    where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true, ...(departmentId ? { departmentId } : {}) },
    include: { department: true },
    orderBy: { name: "asc" },
  });
  return Promise.all(
    users.map(async (u) => {
      const p = await calculateLevelProgress(u.id);
      return {
        userId: u.id, name: u.name, avatarColor: u.avatarColor, department: u.department?.name ?? "—",
        currentLevel: p.currentLevel, currentLevelName: p.currentLevelName,
        nextLevel: p.targetLevel, nextLevelName: p.targetLevelName,
        progressPercent: p.progressPercent, missingHeadline: p.missing[0] ?? "On track",
        badgeCount: p.badgeCount, lifetimePoints: p.lifetimePoints, latestGrade: p.latestGrade,
      };
    }),
  );
}
