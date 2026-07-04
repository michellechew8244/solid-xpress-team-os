import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentPeriod, growthLevelName, LEVEL_THRESHOLDS, GRADE_LABEL } from "@/lib/enums";
import { isOverdue, shortDate, ragFromPct } from "@/lib/format";
import { klNow } from "@/lib/attendance";
import { kpiPoints } from "@/lib/points";
import { Avatar, Card, Pill, Progress, SectionTitle, StatCard } from "@/components/ui";
import { AiPanel } from "@/components/AiPanel";
import { computeIndividualPerformance } from "@/lib/performance";

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

  // Today's attendance + diamonds-today pulse (Attendance Centre / Game Centre).
  const { dateStr } = klNow();
  const [todayAtt, todayDiamonds, deptKpis] = await Promise.all([
    prisma.attendanceRecord.findUnique({ where: { userId_date: { userId, date: dateStr } } }),
    prisma.pointsTransaction.aggregate({ where: { userId, amount: { gt: 0 }, createdAt: { gte: new Date(`${dateStr}T00:00:00+08:00`) } }, _sum: { amount: true } }),
    // Monthly KPI progress: every active KPI in the staff's department + their result.
    user.departmentId
      ? prisma.kPI.findMany({ where: { departmentId: user.departmentId, status: "ACTIVE" }, include: { results: { where: { userId, period } } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  // Per-KPI progress + point calculation (points = achievement% × multiplier, capped at max).
  const kpiRows = deptKpis.map((k) => {
    const res = k.results[0];
    const actual = res?.actualValue ?? 0;
    const achievement = k.targetValue > 0 ? Math.round((actual / k.targetValue) * 100) : 0;
    const points = kpiPoints(achievement, k.pointMultiplier, k.maxPoints);
    return { id: k.id, name: k.name, unit: k.unit, target: k.targetValue, actual, achievement, points, maxPoints: k.maxPoints, multiplier: k.pointMultiplier, status: res?.status ?? "NOT_STARTED", credited: res?.credited ?? false };
  });
  const kpiOverall = kpiRows.length ? Math.round(kpiRows.reduce((s, r) => s + r.achievement, 0) / kpiRows.length) : 0;
  const kpiPointsEarned = kpiRows.reduce((s, r) => s + r.points, 0);
  const kpiPointsMax = kpiRows.reduce((s, r) => s + r.maxPoints, 0);

  const avgKpi = kpiResults.length ? Math.round(kpiResults.reduce((s, r) => s + r.achievementPct, 0) / kpiResults.length) : 0;
  const myEntries = luckyEntries.reduce((s, e) => s + e.entryCount, 0);
  const nextThreshold = LEVEL_THRESHOLDS[user.officialLevel] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const prevThreshold = LEVEL_THRESHOLDS[user.officialLevel - 1] ?? 0;
  const levelProgress = Math.min(100, Math.round(((user.lifetimePoints - prevThreshold) / Math.max(nextThreshold - prevThreshold, 1)) * 100));
  const overdue = myTasks.filter((t) => t.status === "OVERDUE" || isOverdue(t.deadline, t.status)).length;

  const perf = await computeIndividualPerformance(userId, period);

  return (
    <div className="space-y-6">
      {/* 🗂️ My monthly performance strip (company-linked score) */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Monthly Score" value={`${perf.score} (${perf.grade})`} icon="🗂️" rag={perf.score >= 80 ? "ok" : perf.score >= 70 ? "warn" : "danger"} />
        <StatCard label="My Valid Jobs" value={perf.jobTarget ? `${perf.validJobs} / ${perf.jobTarget}` : perf.validJobs} icon="📦" rag={perf.jobTarget === 0 || perf.validJobs >= perf.jobTarget ? "ok" : "warn"} />
        <StatCard label="Job Achievement" value={`${Math.round(perf.jobVolumePct)}%`} icon="🎯" rag={perf.jobVolumePct >= 100 ? "ok" : perf.jobVolumePct > 0 ? "warn" : "danger"} />
        <Card className="flex items-center justify-center text-center">
          <div>
            <Link href="/performance/monthly-review" className="text-sm font-bold text-brand-700 hover:underline">🗂️ My Performance Card →</Link>
            <div className="mt-0.5 text-[11px] text-ink-muted"><Link href="/ai-performance-coach" className="hover:underline">🤖 AI: how to improve my score</Link></div>
          </div>
        </Card>
      </div>

      {/* ⏰🎮 Daily pulse: attendance + games */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-gradient-to-r from-brand-50 to-white px-4 py-3 text-sm">
        {todayAtt?.clockIn ? (
          <span className="font-semibold text-ok">✅ Checked in{todayAtt.clockOut ? " & out" : ""} today</span>
        ) : (
          <Link href="/attendance" className="font-semibold text-brand-700 hover:underline">⏰ You haven&apos;t checked in yet — check in now →</Link>
        )}
        <span className="text-ink-muted">·</span>
        <span className="text-ink-muted">💎 +{todayDiamonds._sum.amount ?? 0} earned today</span>
        <span className="text-ink-muted">·</span>
        <Link href="/missions-hub" className="text-brand-700 hover:underline">🎮 Today&apos;s missions →</Link>
        <span className="text-ink-muted">·</span>
        <Link href="/pk-arena" className="text-brand-700 hover:underline">⚔️ PK Arena →</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Monthly Score"
          value={review ? Math.round(review.totalScore) : "—"}
          sub={review ? <span className={`font-bold ${GRADE_PILL[review.finalGrade ?? "C"]}`}>Grade {GRADE_LABEL[review.finalGrade ?? "C"]}</span> : "pending review"}
          rag={review ? (review.totalScore >= 80 ? "ok" : review.totalScore >= 70 ? "warn" : "danger") : "neutral"}
          icon="🏁"
        />
        <StatCard label="My Diamonds" value={user.currentPoints.toLocaleString()} sub={`+${monthPoints._sum.amount ?? 0} this month`} icon="💎" />
        <StatCard label="Company Rank" value={`#${rank + 1}`} sub="by current diamonds" icon="🏆" rag="neutral" />
        <StatCard label="Lucky Draw Entries" value={myEntries} sub={luckyEntries[0]?.campaign.title ?? "no active campaign"} rag="neutral" icon="🎰" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My KPI Avg" value={`${avgKpi}%`} sub={`${kpiResults.length} KPIs tracked`} rag={ragFromPct(avgKpi)} icon="📈" />
        <StatCard label="Open Tasks" value={myTasks.length} sub={overdue ? `${overdue} overdue` : "on track"} rag={overdue ? "danger" : "ok"} icon="🎯" />
        <StatCard label="Diamond Earned" value={user.lifetimePoints.toLocaleString()} sub={`Level ${user.officialLevel}`} rag="neutral" icon="🚀" />
        <StatCard label="Badges Earned" value={badges.length} sub="recognition" rag="neutral" icon="🏅" />
      </div>

      {/* 📈 Monthly KPI progress + point calculation */}
      <Card>
        <SectionTitle action={<Link href="/kpi" className="text-xs font-semibold text-brand-600">Enter actuals →</Link>}>
          📈 My Monthly KPI Progress · {period}
        </SectionTitle>
        {kpiRows.length === 0 ? (
          <p className="text-sm text-ink-muted">No KPIs assigned to your department yet.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <div>
                <div className="text-xs text-ink-muted">Overall achievement</div>
                <div className={`text-2xl font-bold ${kpiOverall >= 90 ? "text-ok" : kpiOverall >= 70 ? "text-warn" : "text-danger"}`}>{kpiOverall}%</div>
              </div>
              <div className="min-w-[160px] flex-1">
                <Progress value={Math.min(100, kpiOverall)} rag={ragFromPct(kpiOverall)} />
                <div className="mt-1 text-xs text-ink-muted">KPI diamonds this month: <strong className="text-brand-700">{kpiPointsEarned}</strong> / {kpiPointsMax} possible</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                    <th className="py-2 pr-2">KPI</th><th className="px-2 py-2 text-right">Target</th><th className="px-2 py-2 text-right">Actual</th>
                    <th className="px-2 py-2 text-right">Achieved</th><th className="px-2 py-2">Point calculation</th><th className="px-2 py-2 text-right">💎</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="py-2 pr-2 font-medium text-ink">{r.name}{r.credited && <span className="ml-1 badge bg-green-100 text-green-700">credited</span>}</td>
                      <td className="px-2 py-2 text-right text-ink-muted">{r.target.toLocaleString()}{r.unit ? ` ${r.unit}` : ""}</td>
                      <td className="px-2 py-2 text-right">{r.actual.toLocaleString()}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${r.achievement >= 90 ? "text-ok" : r.achievement >= 70 ? "text-warn" : "text-danger"}`}>{r.achievement}%</td>
                      <td className="px-2 py-2 text-xs text-ink-muted">{r.achievement}% × {r.multiplier} = {Math.round(r.achievement * r.multiplier)}{Math.round(r.achievement * r.multiplier) > r.maxPoints ? ` → capped ${r.maxPoints}` : ""}</td>
                      <td className="px-2 py-2 text-right font-bold text-brand-700">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-ink-muted">💡 KPI diamonds = achievement % × multiplier, capped at each KPI&apos;s max. Diamonds are credited to your wallet once your manager approves your submission.</p>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle action={<Link href="/badges" className="text-xs font-semibold text-brand-600">View Growth Roadmap →</Link>}>
          Growth Path · Level {user.officialLevel} — {growthLevelName(user.officialLevel)}
        </SectionTitle>
        <Progress value={levelProgress} rag="ok" />
        <div className="mt-1 flex justify-between text-xs text-ink-muted">
          <span>{user.lifetimePoints.toLocaleString()} lifetime 💎</span>
          <span>{user.officialLevel < 7 ? `${nextThreshold.toLocaleString()} 💎 to Level ${user.officialLevel + 1}` : "Max level — Elite!"}</span>
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
          <p className="text-sm text-ink-muted">No redemptions yet — spend your diamonds in the reward store!</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {redeemed.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>{r.reward.imageEmoji} {r.reward.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted">{r.pointsSpent} 💎</span>
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
