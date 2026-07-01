import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentPeriod, growthLevelName, LEVEL_THRESHOLDS, GRADE_LABEL } from "@/lib/enums";
import { isOverdue, shortDate, ragFromPct } from "@/lib/format";
import { Avatar, Card, Pill, Progress, SectionTitle, StatCard } from "@/components/ui";
import { AiPanel } from "@/components/AiPanel";

const GRADE_PILL: Record<string, string> = {
  A_PLUS: "text-green-700", A: "text-emerald-700", B: "text-sky-700", C: "text-amber-700", D: "text-orange-700", E: "text-rose-700",
};

export async function StaffHome({ userId, name }: { userId: string; name: string }) {
  const period = currentPeriod();
  const [user, myTasks, kpiResults, monthPoints, rank, badges, review, luckyEntries, redeemed] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { department: true } }),
    prisma.task.findMany({
      where: { assigneeId: userId, status: { notIn: ["COMPLETED", "REJECTED"] } },
      orderBy: [{ priority: "desc" }, { deadline: "asc" }],
      take: 6,
      include: { job: true },
    }),
    prisma.kPIResult.findMany({ where: { userId, period }, include: { kpi: true } }),
    prisma.pointsTransaction.aggregate({ where: { userId, period, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.user.count({ where: { currentPoints: { gt: (await prisma.user.findUnique({ where: { id: userId } }))!.currentPoints } } }),
    prisma.userBadge.findMany({ where: { userId }, include: { badge: true }, take: 6 }),
    prisma.performanceReview.findFirst({ where: { staffId: userId, period } }),
    prisma.luckyDrawEntry.findMany({ where: { userId, campaign: { status: "ACTIVE" } }, include: { campaign: true } }),
    prisma.rewardRedemption.findMany({ where: { userId }, include: { reward: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  if (!user) return null;

  const avgKpi = kpiResults.length ? Math.round(kpiResults.reduce((s, r) => s + r.achievementPct, 0) / kpiResults.length) : 0;
  const myEntries = luckyEntries.reduce((s, e) => s + e.entryCount, 0);
  const nextThreshold = LEVEL_THRESHOLDS[user.officialLevel] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const prevThreshold = LEVEL_THRESHOLDS[user.officialLevel - 1] ?? 0;
  const levelProgress = Math.min(100, Math.round(((user.lifetimePoints - prevThreshold) / Math.max(nextThreshold - prevThreshold, 1)) * 100));
  const overdue = myTasks.filter((t) => t.status === "OVERDUE" || isOverdue(t.deadline, t.status)).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Monthly Score"
          value={review ? Math.round(review.totalScore) : "—"}
          sub={review ? <span className={`font-bold ${GRADE_PILL[review.finalGrade ?? "C"]}`}>Grade {GRADE_LABEL[review.finalGrade ?? "C"]}</span> : "pending review"}
          rag={review ? (review.totalScore >= 80 ? "ok" : review.totalScore >= 70 ? "warn" : "danger") : "neutral"}
          icon="🏁"
        />
        <StatCard label="My Points" value={user.currentPoints.toLocaleString()} sub={`+${monthPoints._sum.amount ?? 0} this month`} icon="💎" />
        <StatCard label="Company Rank" value={`#${rank + 1}`} sub="by current points" icon="🏆" rag="neutral" />
        <StatCard label="Lucky Draw Entries" value={myEntries} sub={luckyEntries[0]?.campaign.title ?? "no active campaign"} rag="neutral" icon="🎰" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My KPI Avg" value={`${avgKpi}%`} sub={`${kpiResults.length} KPIs tracked`} rag={ragFromPct(avgKpi)} icon="📈" />
        <StatCard label="Open Tasks" value={myTasks.length} sub={overdue ? `${overdue} overdue` : "on track"} rag={overdue ? "danger" : "ok"} icon="🎯" />
        <StatCard label="Lifetime Points" value={user.lifetimePoints.toLocaleString()} sub={`Level ${user.officialLevel}`} rag="neutral" icon="🚀" />
        <StatCard label="Badges Earned" value={badges.length} sub="recognition" rag="neutral" icon="🏅" />
      </div>

      <Card>
        <SectionTitle action={<Link href="/badges" className="text-xs font-semibold text-brand-600">View Growth Roadmap →</Link>}>
          Growth Path · Level {user.officialLevel} — {growthLevelName(user.officialLevel)}
        </SectionTitle>
        <Progress value={levelProgress} rag="ok" />
        <div className="mt-1 flex justify-between text-xs text-ink-muted">
          <span>{user.lifetimePoints.toLocaleString()} lifetime pts</span>
          <span>{user.officialLevel < 7 ? `${nextThreshold.toLocaleString()} pts to Level ${user.officialLevel + 1}` : "Max level — Elite!"}</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle action={<Link href="/missions" className="text-xs font-semibold text-brand-600">All missions →</Link>}>
            🎯 My Top Missions
          </SectionTitle>
          <div className="divide-y divide-slate-100">
            {myTasks.length === 0 && <p className="py-4 text-sm text-ink-muted">No open tasks. Great job!</p>}
            {myTasks.map((t) => (
              <Link key={t.id} href={`/missions/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{t.title}</div>
                  <div className="text-xs text-ink-muted">{t.job?.jobNumber ? `${t.job.jobNumber} · ` : ""}Due {shortDate(t.deadline)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Pill value={t.priority} />
                  <Pill value={t.status === "OVERDUE" || isOverdue(t.deadline, t.status) ? "OVERDUE" : t.status} />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle action={<Link href="/badges" className="text-xs font-semibold text-brand-600">Badge centre →</Link>}>🏅 My Badges</SectionTitle>
          {badges.length === 0 && <p className="text-sm text-ink-muted">No badges yet — earn your first one!</p>}
          <div className="grid grid-cols-3 gap-2">
            {badges.map((b) => (
              <div key={b.id} className="flex flex-col items-center rounded-lg bg-slate-50 p-2 text-center" title={b.badge.description}>
                <span className="text-2xl">{b.badge.icon}</span>
                <span className="mt-1 text-[10px] font-semibold leading-tight text-ink-soft">{b.badge.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle action={<Link href="/rewards" className="text-xs font-semibold text-brand-600">Reward store →</Link>}>🎁 My Redeemed Rewards</SectionTitle>
        {redeemed.length === 0 ? (
          <p className="text-sm text-ink-muted">No redemptions yet — spend your points in the reward store!</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {redeemed.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>{r.reward.imageEmoji} {r.reward.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted">{r.pointsSpent} pts</span>
                  <Pill value={r.status === "APPROVED" || r.status === "FULFILLED" ? "COMPLETED" : r.status === "REJECTED" ? "REJECTED" : "WAITING_EXTERNAL"} label={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AiPanel
        scope="staff"
        title="AI: Suggest My Priorities Today"
        context={{
          urgentTasks: myTasks.filter((t) => t.priority === "URGENT" || t.priority === "HIGH").map((t) => t.title),
          kpiPct: avgKpi,
          openTasks: myTasks.length,
        }}
      />
    </div>
  );
}
