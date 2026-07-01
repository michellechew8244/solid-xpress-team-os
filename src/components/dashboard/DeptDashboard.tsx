import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentPeriod, GRADE_LABEL } from "@/lib/enums";
import { isOverdue, ragFromPct, shortDate } from "@/lib/format";
import { Avatar, Card, Pill, Progress, SectionTitle, StatCard } from "@/components/ui";
import { AiPanel } from "@/components/AiPanel";

const GRADE_PILL: Record<string, string> = {
  A_PLUS: "bg-green-100 text-green-700", A: "bg-emerald-100 text-emerald-700", B: "bg-sky-100 text-sky-700",
  C: "bg-amber-100 text-amber-700", D: "bg-orange-100 text-orange-700", E: "bg-rose-100 text-rose-700",
};

/** Department Head view — scoped to their own department + staff (section A). */
export async function DeptDashboard({ departmentId }: { departmentId: string | null }) {
  if (!departmentId) {
    return <Card><p className="text-sm text-ink-muted">You are not assigned to a department.</p></Card>;
  }
  const period = currentPeriod();
  const [dept, staff, tasks, kpiResults, todayReports, periodTx, reviews, pendingRedemptions] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId } }),
    prisma.user.findMany({ where: { departmentId }, orderBy: { currentPoints: "desc" }, include: { profile: true } }),
    prisma.task.findMany({ where: { departmentId }, include: { assignee: true } }),
    prisma.kPIResult.findMany({ where: { period, kpi: { departmentId } }, include: { kpi: true, user: true } }),
    prisma.dailyReport.findMany({ where: { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, user: { departmentId } }, include: { user: true } }),
    prisma.pointsTransaction.findMany({ where: { period, user: { departmentId } }, select: { amount: true, type: true } }),
    prisma.performanceReview.findMany({ where: { period, staff: { departmentId } }, include: { staff: true } }),
    prisma.rewardRedemption.findMany({ where: { status: "PENDING", user: { departmentId } }, include: { reward: true, user: true } }),
  ]);

  const overdue = tasks.filter((t) => t.status === "OVERDUE" || isOverdue(t.deadline, t.status));
  const open = tasks.filter((t) => !["COMPLETED", "REJECTED"].includes(t.status));
  const avgKpi = kpiResults.length ? Math.round(kpiResults.reduce((s, r) => s + r.achievementPct, 0) / kpiResults.length) : 0;
  const reportedIds = new Set(todayReports.map((r) => r.userId));
  const notReported = staff.filter((s) => !reportedIds.has(s.id) && s.role === "STAFF");
  const pointsEarned = periodTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const pointsDeducted = periodTx.filter((t) => t.type === "PENALTY" && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const deptScore = reviews.length ? Math.round(reviews.reduce((s, r) => s + r.totalScore, 0) / reviews.length) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Department Score" value={deptScore} sub="avg monthly grade" rag={deptScore >= 80 ? "ok" : deptScore >= 70 ? "warn" : "danger"} icon="🏁" />
        <StatCard label="Department KPI" value={`${avgKpi}%`} rag={ragFromPct(avgKpi)} sub={dept?.name} icon="📈" />
        <StatCard label="Diamonds Earned" value={pointsEarned.toLocaleString()} sub={`${pointsDeducted} deducted`} rag="ok" icon="💎" />
        <StatCard label="Team Size" value={staff.length} sub={`${todayReports.length}/${staff.filter((s) => s.role === "STAFF").length} reported today`} icon="👥" rag="neutral" />
      </div>

      {pendingRedemptions.length > 0 && (
        <Card className="border-l-4 border-l-warn">
          <SectionTitle action={<Link href="/rewards" className="text-xs font-semibold text-brand-600">Review →</Link>}>Pending Reward Approvals ({pendingRedemptions.length})</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {pendingRedemptions.map((r) => (
              <span key={r.id} className="badge bg-amber-100 text-amber-700">{r.user.name}: {r.reward.imageEmoji} {r.reward.name}</span>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Team Performance</SectionTitle>
          <div className="space-y-1">
            {staff.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <span className="w-4 text-xs font-bold text-ink-muted">{i + 1}</span>
                <Avatar name={s.name} color={s.avatarColor} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.name}</div>
                  <div className="truncate text-xs text-ink-muted">{s.jobTitle}</div>
                </div>
                <span className="text-sm font-semibold text-brand-700">{s.currentPoints} 💎</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle action={<Link href="/missions" className="text-xs font-semibold text-brand-600">Mission board →</Link>}>Overdue & Blockers</SectionTitle>
          {overdue.length === 0 && <p className="text-sm text-ink-muted">No overdue tasks. 🎉</p>}
          <div className="space-y-2">
            {overdue.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{t.title}</div>
                  <div className="text-xs text-ink-muted">{t.assignee?.name} · due {shortDate(t.deadline)}</div>
                </div>
                <Pill value="OVERDUE" />
              </div>
            ))}
          </div>
          {notReported.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase text-ink-muted">Not yet reported today</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {notReported.map((s) => <span key={s.id} className="badge bg-amber-100 text-amber-700">{s.name}</span>)}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>Staff Grade List ({period})</SectionTitle>
        {reviews.length === 0 ? (
          <p className="text-sm text-ink-muted">No reviews generated yet — run &ldquo;Generate Reviews&rdquo; in Performance Review.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.sort((a, b) => b.totalScore - a.totalScore).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar name={r.staff.name} color={r.staff.avatarColor} size={26} />
                  <span className="text-sm font-medium">{r.staff.name}</span>
                </div>
                <span className={`badge ${GRADE_PILL[r.finalGrade ?? "C"]}`}>{GRADE_LABEL[r.finalGrade ?? "C"]} · {Math.round(r.totalScore)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AiPanel
        scope="department"
        title="AI: Weekly Department Review"
        context={{
          department: dept?.name,
          kpiPct: avgKpi,
          overdue: overdue.length,
          blockers: todayReports.map((r) => r.needHelp).filter(Boolean),
        }}
      />
    </div>
  );
}
