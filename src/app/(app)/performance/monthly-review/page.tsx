import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { computeIndividualPerformance, computeDepartmentPerformance, computeCompanyPerformance, coachingTriggers, INDIVIDUAL_WEIGHTS } from "@/lib/performance";
import { Card, PageHeader, SectionTitle, StatCard, Pill, Avatar } from "@/components/ui";

const rm = (n: number) => `RM ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function MonthlyReviewPage({ searchParams }: { searchParams: Promise<{ period?: string; user?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const manager = isBoss(me.role) || me.role === "DEPARTMENT_HEAD" || me.role === "HR_ADMIN";

  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();

  // Managers can inspect anyone in scope; staff see themselves.
  let target = me;
  if (manager && sp.user) {
    const u = await prisma.user.findUnique({ where: { id: sp.user }, include: { department: true } });
    if (u && (isBoss(me.role) || me.role === "HR_ADMIN" || u.departmentId === me.departmentId)) {
      target = { ...me, id: u.id, name: u.name, departmentId: u.departmentId, department: u.department, avatarColor: u.avatarColor, currentPoints: u.currentPoints, officialLevel: u.officialLevel };
    }
  }

  const scopePeople = manager
    ? await prisma.user.findMany({
        where: { isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] }, NOT: { email: { endsWith: "@solidxpress.system" } }, ...(me.role === "DEPARTMENT_HEAD" && me.departmentId ? { departmentId: me.departmentId } : {}) },
        select: { id: true, name: true }, orderBy: { name: "asc" },
      })
    : [];

  const [ind, company, dept, earned, deducted, badges, pkWins, commission, bonusShares, triggers, review] = await Promise.all([
    computeIndividualPerformance(target.id, period),
    computeCompanyPerformance(period),
    target.departmentId ? computeDepartmentPerformance(target.departmentId, period) : Promise.resolve(null),
    prisma.pointsTransaction.aggregate({ where: { userId: target.id, period, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.pointsTransaction.aggregate({ where: { userId: target.id, period, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.userBadge.count({ where: { userId: target.id } }),
    prisma.pKResult.findMany({ where: { winnerUserId: target.id }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.commissionRecord.findUnique({ where: { userId_period: { userId: target.id, period } } }),
    prisma.individualBonusAllocation.findMany({ where: { userId: target.id, allocation: { bonusPool: { period } } } }),
    coachingTriggers(target.id, period),
    prisma.performanceReview.findUnique({ where: { staffId_period: { staffId: target.id, period } } }),
  ]);

  const bonusShare = bonusShares.reduce((s, b) => s + (b.excluded ? 0 : b.amount), 0);
  const COMPONENT_LABELS: Record<keyof typeof INDIVIDUAL_WEIGHTS, string> = {
    businessResult: "Business result (outcomes delivered)",
    customerOutcome: "Customer / internal outcome",
    accuracyRisk: "Accuracy & risk control",
    contribution: "Contribution / improvement",
    discipline: "Discipline support",
  };

  return (
    <>
      <PageHeader title="🗂️ Monthly Performance Card" subtitle={`The full performance picture — score, jobs, diamonds, ranking, commission and coaching · ${period}`} />

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/performance/monthly-review" method="get">
        <input type="month" name="period" defaultValue={period} className="input w-44" />
        {manager && (
          <select name="user" className="input w-56" defaultValue={target.id === me.id ? "" : target.id}>
            <option value="">Me ({me.name})</option>
            {scopePeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <button className="btn-ghost">View</button>
      </form>

      <Card className="mb-5">
        <div className="flex items-center gap-3">
          <Avatar name={target.name} color={target.avatarColor} size={44} />
          <div>
            <div className="text-lg font-bold text-ink">{target.name}</div>
            <div className="text-xs text-ink-muted">{target.department?.name ?? "No department"}{ind.positionName ? ` · ${ind.positionName}` : ""} · Level {target.officialLevel}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-3xl font-black text-brand-700">{ind.score}</span>
            <Pill value={ind.score >= 80 ? "OK" : ind.score >= 70 ? "WARN" : "DANGER"} label={`Grade ${ind.grade}`} />
          </div>
        </div>
      </Card>

      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Valid Jobs" value={ind.jobTarget ? `${ind.validJobs} / ${ind.jobTarget}` : ind.validJobs} icon="📦" rag={ind.jobTarget === 0 || ind.validJobs >= ind.jobTarget ? "ok" : "warn"} />
        <StatCard label="Job Achievement" value={`${Math.round(ind.jobVolumePct)}%`} icon="🎯" rag={ind.jobVolumePct >= 100 ? "ok" : ind.jobVolumePct > 0 ? "warn" : "danger"} />
        <StatCard label="Diamonds Earned" value={`+${earned._sum.amount ?? 0}`} icon="💎" rag="ok" />
        <StatCard label="Diamonds Deducted" value={`−${Math.abs(deducted._sum.amount ?? 0)}`} icon="⚠️" rag={(deducted._sum.amount ?? 0) < 0 ? "warn" : "ok"} />
        <StatCard label="Company Score" value={`${company.score} (${company.grade})`} icon="🏢" rag="neutral" />
        <StatCard label="Department Score" value={dept ? `${dept.score} (${dept.grade})` : "—"} icon="🏬" rag="neutral" />
        <StatCard label="Commission" value={commission ? rm(commission.amount) : "—"} icon="💰" rag="neutral" />
        <StatCard label="Bonus Pool Share" value={bonusShare > 0 ? rm(bonusShare) : "—"} icon="🎁" rag="neutral" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Score breakdown (universal formula)</SectionTitle>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {(Object.keys(INDIVIDUAL_WEIGHTS) as (keyof typeof INDIVIDUAL_WEIGHTS)[]).map((k) => (
                <tr key={k}>
                  <td className="py-1.5">{COMPONENT_LABELS[k]}</td>
                  <td className="text-xs text-ink-muted">{INDIVIDUAL_WEIGHTS[k]}%</td>
                  <td><Pill value={ind.components[k] >= 100 ? "OK" : ind.components[k] >= 70 ? "WARN" : "DANGER"} label={`${Math.round(ind.components[k])}%`} /></td>
                  <td className="text-right text-xs font-semibold">{((ind.components[k] / 100) * INDIVIDUAL_WEIGHTS[k]).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-ink-muted">Badges earned (all time): {badges} · PK podiums: {pkWins.length}</div>
        </Card>

        <div className="space-y-5">
          <Card>
            <SectionTitle>Coaching status</SectionTitle>
            {triggers.length === 0
              ? <p className="text-sm text-ok">✅ No coaching triggers this month.</p>
              : <ul className="space-y-1 text-sm text-amber-700">{triggers.map((t, i) => <li key={i}>⚠️ {t}</li>)}</ul>}
            {review?.improvementPlan && <p className="mt-2 text-xs text-ink-muted"><b>Improvement plan:</b> {review.improvementPlan}</p>}
          </Card>
          <Card>
            <SectionTitle>Next month targets</SectionTitle>
            <ul className="space-y-1 text-sm text-ink-soft">
              {ind.jobTarget > 0 && <li>📦 Hit {ind.jobTarget}+ valid jobs (aim {Math.round(ind.jobTarget * 1.1)} for a 110% volume score).</li>}
              <li>🎯 Lift your weakest component: {(Object.entries(ind.components) as [string, number][]).sort((a, b) => a[1] - b[1])[0][0]}.</li>
              <li>💡 Submit at least one improvement proposal.</li>
              <li>⏰ Keep attendance discipline at 100%.</li>
            </ul>
            <a href="/ai-performance-coach" className="btn-ghost mt-3 inline-block px-3 py-1 text-xs">🤖 Get my full AI analysis →</a>
          </Card>
        </div>
      </div>
    </>
  );
}
