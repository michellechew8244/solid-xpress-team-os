import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss, canApproveTasks } from "@/lib/rbac";
import { shortDate } from "@/lib/format";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { AwardBadgeForm } from "@/components/AwardBadgeForm";
import { BadgeRoadmap, type BadgeRoadmapItem } from "@/components/BadgeRoadmap";
import { calculateLevelProgress, getLevelRules, getRecommendedLevelMissions, getTeamGrowthOverview } from "@/services/growth";
import { LevelProgressCard } from "@/components/growth/LevelProgressCard";
import { GrowthLevelCard } from "@/components/growth/GrowthLevelCard";
import { NextLevelChecklist } from "@/components/growth/NextLevelChecklist";
import { MissionPathCard } from "@/components/growth/MissionPathCard";
import { LevelRewardCard } from "@/components/growth/LevelRewardCard";
import { LevelHistoryTimeline } from "@/components/growth/LevelHistoryTimeline";
import { TeamGrowthTable } from "@/components/growth/TeamGrowthTable";
import { LevelUpgradeApprovalPanel } from "@/components/growth/LevelUpgradeApprovalPanel";
import type { LevelState } from "@/components/growth/LevelStatusPill";

export default async function BadgesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const canAward = canApproveTasks(user.role) || user.role === "HR_ADMIN";
  const canSeeTeamGrowth = isBoss(user.role) || user.role === "HR_ADMIN" || user.role === "DEPARTMENT_HEAD";

  const [badges, myBadges, staffForAward, rules, nextProgress, missions] = await Promise.all([
    prisma.badge.findMany({ include: { _count: { select: { users: true } } } }),
    prisma.userBadge.findMany({ where: { userId: user.id }, select: { badgeId: true, awardedAt: true, note: true } }),
    canAward
      ? prisma.user.findMany({
          where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true, ...(isBoss(user.role) || user.role === "HR_ADMIN" ? {} : { departmentId: user.departmentId ?? "" }) },
          orderBy: { name: "asc" }, select: { id: true, name: true },
        })
      : Promise.resolve([]),
    getLevelRules(),
    calculateLevelProgress(user.id), // defaults to the user's immediate next level
    getRecommendedLevelMissions(user.id),
  ]);
  const earnedMap = new Map(myBadges.map((b) => [b.badgeId, b]));

  // Badge Roadmap view-model: order the trail from most-commonly-earned
  // (entry milestones) to rarest (prestige), tie-broken by lower points bonus
  // then name, so the journey reads easiest → hardest.
  const roadmapItems: BadgeRoadmapItem[] = badges
    .map((b) => {
      const mine = earnedMap.get(b.id);
      return {
        id: b.id, name: b.name, description: b.description, criteria: b.criteria, icon: b.icon,
        pointsBonus: b.pointsBonus, departmentEligibility: b.departmentEligibility, earnedCount: b._count.users,
        earned: Boolean(mine), earnedDate: mine ? shortDate(mine.awardedAt) : null, note: mine?.note ?? null,
      };
    })
    .sort((a, b) => b.earnedCount - a.earnedCount || a.pointsBonus - b.pointsBonus || a.name.localeCompare(b.name));

  // Per-level checklist for every level 2-7 (level 1 has no requirements) — powers the clickable cards.
  const checklistByLevel = new Map(
    await Promise.all(
      rules.map(async (r): Promise<[number, Awaited<ReturnType<typeof calculateLevelProgress>>["checklist"]]> =>
        r.levelNumber === 1 ? [1, []] : [r.levelNumber, (await calculateLevelProgress(user.id, r.levelNumber)).checklist]),
    ),
  );

  const officialLevel = user.officialLevel;
  function levelState(levelNumber: number): LevelState {
    if (levelNumber < officialLevel) return "completed";
    if (levelNumber === officialLevel) return "current";
    if (levelNumber === officialLevel + 1 && nextProgress.isReadyToUpgrade) return "ready";
    return "locked";
  }

  // My Growth History
  const historyRows = await prisma.levelHistory.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const approverIds = [...new Set(historyRows.map((h) => h.approvedById).filter(Boolean))] as string[];
  const approvers = approverIds.length ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } }) : [];
  const approverMap = new Map(approvers.map((a) => [a.id, a.name]));
  const historyVM = historyRows.map((h) => ({
    id: h.id, fromLevel: h.fromLevel, toLevel: h.toLevel, reason: h.reason,
    approverName: h.approvedById ? approverMap.get(h.approvedById) ?? null : null,
    bonusPointsAwarded: h.bonusPointsAwarded, dateLabel: shortDate(h.createdAt),
  }));

  // Manager: Team Growth Overview + pending upgrade approvals
  let teamRows: Awaited<ReturnType<typeof getTeamGrowthOverview>> = [];
  let pendingApprovals: { id: string; userName: string; avatarColor: string; fromLevel: number; toLevel: number; toLevelName: string }[] = [];
  if (canSeeTeamGrowth) {
    const deptScope = isBoss(user.role) || user.role === "HR_ADMIN" ? null : user.departmentId;
    teamRows = await getTeamGrowthOverview(deptScope);
    const pending = await prisma.levelUpgradeRequest.findMany({
      where: { status: "PENDING", ...(deptScope ? { user: { departmentId: deptScope } } : {}) },
      include: { user: true },
      orderBy: { requestedAt: "asc" },
    });
    const ruleNames = new Map(rules.map((r) => [r.levelNumber, r.levelName]));
    pendingApprovals = pending.map((p) => ({ id: p.id, userName: p.user.name, avatarColor: p.user.avatarColor, fromLevel: p.fromLevel, toLevel: p.toLevel, toLevelName: ruleNames.get(p.toLevel) ?? "" }));
  }

  return (
    <>
      <PageHeader
        title="Badge Centre"
        subtitle="Recognition for skill, reliability and teamwork"
        action={canAward ? <AwardBadgeForm staff={staffForAward} badges={badges.map((b) => ({ id: b.id, name: b.name, icon: b.icon, pointsBonus: b.pointsBonus }))} /> : undefined}
      />

      {/* ---- Growth Roadmap ------------------------------------------------ */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">🪜 Growth Roadmap</h2>
        <p className="text-sm text-ink-muted">Your journey from daily execution to Solid Xpress Elite.</p>
      </div>

      {/* Section 1 */}
      <div className="mb-6"><LevelProgressCard progress={nextProgress} /></div>

      {/* Section 2 — clickable level cards */}
      <div id="growth-levels" className="mb-6 scroll-mt-20">
        <Card>
          <SectionTitle>Growth Levels</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {rules.map((r) => (
              <GrowthLevelCard
                key={r.levelNumber}
                rule={r}
                levelState={levelState(r.levelNumber)}
                checklist={checklistByLevel.get(r.levelNumber) ?? []}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Section 3 — Next Level Checklist */}
      <div id="next-level-checklist" className="mb-6 scroll-mt-20">
        <Card>
          <SectionTitle>Your Next Level Checklist</SectionTitle>
          <NextLevelChecklist progress={nextProgress} />
        </Card>
      </div>

      {/* Section 4 — Next Best Missions */}
      {missions.length > 0 && (
        <div className="mb-6">
          <Card>
            <SectionTitle>Next Best Missions</SectionTitle>
            <p className="mb-3 -mt-2 text-xs text-ink-muted">Complete these missions to unlock your next level faster.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {missions.map((m) => <MissionPathCard key={m.id} mission={m} />)}
            </div>
          </Card>
        </div>
      )}

      {/* Section 5 — Level Rewards */}
      <div className="mb-6">
        <Card>
          <SectionTitle>Level Rewards</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((r) => (
              <LevelRewardCard key={r.levelNumber} levelNumber={r.levelNumber} levelName={r.levelName} rewardDescription={r.rewardDescription} unlocked={r.levelNumber <= user.officialLevel} />
            ))}
          </div>
        </Card>
      </div>

      {/* Section 6 — My Growth History */}
      <div className="mb-6">
        <Card>
          <SectionTitle>My Growth History</SectionTitle>
          <LevelHistoryTimeline history={historyVM} />
        </Card>
      </div>

      {/* Section 7 — Team Growth Overview (Boss / HR / Dept Head) */}
      {canSeeTeamGrowth && (
        <div className="mb-6 space-y-4">
          <Card>
            <SectionTitle>Team Growth Overview</SectionTitle>
            {pendingApprovals.length > 0 && (
              <div className="mb-4">
                <div className="mb-1 text-xs font-semibold uppercase text-ink-muted">Pending Level Upgrade Requests</div>
                <LevelUpgradeApprovalPanel requests={pendingApprovals} />
              </div>
            )}
            <TeamGrowthTable rows={teamRows} />
          </Card>
        </div>
      )}

      {/* ---- Badge Roadmap -------------------------------------------------- */}
      <SectionTitle>Badge Roadmap</SectionTitle>
      <Card>
        <BadgeRoadmap items={roadmapItems} />
      </Card>
    </>
  );
}
