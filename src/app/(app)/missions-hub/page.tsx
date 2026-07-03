import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { klNow, computeStreak } from "@/lib/attendance";
import { currentWindow, missionProgress, MISSION_CATEGORIES, MISSION_TYPES } from "@/lib/missions";
import { Card, EmptyState, PageHeader, Progress, SectionTitle, StatCard } from "@/components/ui";
import { ClaimMissionButton, NewMissionForm, MissionToggle, SeedMissionsButton } from "@/components/MissionHubControls";
import { requireFeature } from "@/lib/features";

export default async function GameCentrePage() {
  await requireFeature("game-centre");
  const user = await getCurrentUser();
  if (!user) return null;
  const canManage = isBoss(user.role) || user.role === "HR_ADMIN";
  const { dateStr } = klNow();

  const [missions, streak] = await Promise.all([
    prisma.mission.findMany({ orderBy: [{ missionType: "asc" }, { createdAt: "asc" }] }),
    computeStreak(user.id, dateStr),
  ]);
  const active = missions.filter((m) => m.isActive);

  // Compute live progress + claim state for each active mission.
  const rows = await Promise.all(
    active.map(async (m) => {
      const w = currentWindow(m.missionType);
      const [progress, claim] = await Promise.all([
        missionProgress(user.id, m.category, w),
        prisma.missionClaim.findUnique({ where: { missionId_userId_periodKey: { missionId: m.id, userId: user.id, periodKey: w.periodKey } } }),
      ]);
      return { ...m, progress, claimed: Boolean(claim), periodKey: w.periodKey };
    }),
  );

  const claimable = rows.filter((r) => !r.claimed && r.progress >= r.targetValue).length;
  const earnedFromMissions = await prisma.pointsTransaction.aggregate({ where: { userId: user.id, sourceType: "MISSION_COMPLETION", amount: { gt: 0 } }, _sum: { amount: true } });

  const groups: { type: string; label: string; icon: string }[] = [
    { type: "DAILY", label: "Daily Missions", icon: "☀️" },
    { type: "WEEKLY", label: "Weekly Quests", icon: "🗓️" },
    { type: "MONTHLY", label: "Monthly Challenges", icon: "🏔️" },
  ];

  return (
    <>
      <PageHeader
        title="🎮 Game Centre"
        subtitle="Your daily work earns diamonds, badges, level progress and recognition."
        action={canManage ? <NewMissionForm types={MISSION_TYPES} categories={MISSION_CATEGORIES} /> : undefined}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Rewards ready to claim" value={claimable} icon="🎁" rag={claimable ? "ok" : "neutral"} />
        <StatCard label="Check-in streak" value={`${streak} days`} icon="🔥" rag="neutral" />
        <StatCard label="Diamonds from missions" value={(earnedFromMissions._sum.amount ?? 0).toLocaleString()} icon="💎" rag="neutral" />
      </div>

      {active.length === 0 ? (
        <Card>
          <EmptyState title="No missions yet 🎯" hint={canManage ? "Load the starter set to kick things off." : "Missions are coming soon!"} />
          {canManage && <div className="mt-3 text-center"><SeedMissionsButton /></div>}
        </Card>
      ) : (
        groups.map((g) => {
          const list = rows.filter((r) => r.missionType === g.type);
          if (list.length === 0) return null;
          return (
            <Card key={g.type} className="mb-6">
              <SectionTitle>{g.icon} {g.label}</SectionTitle>
              <div className="divide-y divide-slate-100">
                {list.map((m) => {
                  const pct = Math.min(100, Math.round((m.progress / m.targetValue) * 100));
                  return (
                    <div key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-ink">{m.title}</span>
                          <span className="badge bg-slate-100 text-slate-600">{MISSION_CATEGORIES[m.category] ?? m.category}</span>
                          <span className="badge bg-brand-50 text-brand-700">+{m.diamondReward} 💎{m.luckyDrawEntries > 0 ? ` · 🎟️×${m.luckyDrawEntries}` : ""}</span>
                        </div>
                        {m.description && <div className="text-xs text-ink-muted">{m.description}</div>}
                        <div className="mt-1 flex items-center gap-2">
                          <div className="w-40"><Progress value={pct} rag={pct >= 100 ? "ok" : undefined} /></div>
                          <span className="text-xs text-ink-muted">{m.progress}/{m.targetValue}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ClaimMissionButton missionId={m.id} ready={m.progress >= m.targetValue} claimed={m.claimed} />
                        {canManage && <MissionToggle missionId={m.id} active={m.isActive} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}

      {canManage && missions.some((m) => !m.isActive) && (
        <Card className="mb-6">
          <SectionTitle>Inactive missions</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {missions.filter((m) => !m.isActive).map((m) => (
              <span key={m.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                {m.title} <MissionToggle missionId={m.id} active={false} />
              </span>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
