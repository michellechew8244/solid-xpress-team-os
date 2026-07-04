import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { currentPeriod } from "@/lib/enums";
import { computeDepartmentPerformance, DEPARTMENT_WEIGHTS } from "@/lib/performance";
import { Card, PageHeader, SectionTitle, Pill } from "@/components/ui";
import { saveDepartmentGoal } from "../actions";

export default async function DepartmentGoalsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const canEdit = isBoss(me.role);
  if (!canEdit && me.role !== "DEPARTMENT_HEAD" && me.role !== "HR_ADMIN") redirect("/dashboard");

  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();

  // Dept heads only see their own department.
  const departments = await prisma.department.findMany({
    where: { status: "ACTIVE", ...(me.role === "DEPARTMENT_HEAD" && me.departmentId ? { id: me.departmentId } : {}) },
    orderBy: { name: "asc" },
  });
  const goals = await prisma.departmentGoal.findMany({ where: { period, departmentId: { in: departments.map((d) => d.id) } } });
  const perfs = await Promise.all(departments.map((d) => computeDepartmentPerformance(d.id, period)));

  return (
    <>
      <PageHeader title="🏬 Department KPI Centre" subtitle={`Break company goals into department targets · ${period}`} />

      <form className="mb-4 flex items-center gap-2" action="/goals/departments" method="get">
        <input type="month" name="period" defaultValue={period} className="input w-44" />
        <button className="btn-ghost">View month</button>
      </form>

      <Card className="mb-5 p-4 text-xs text-ink-muted">
        Department Score = KPI achievement ×{DEPARTMENT_WEIGHTS.kpi}% + job volume / SLA ×{DEPARTMENT_WEIGHTS.jobVolume}% + accuracy ×{DEPARTMENT_WEIGHTS.accuracy}%
        + teamwork ×{DEPARTMENT_WEIGHTS.teamwork}% + attendance ×{DEPARTMENT_WEIGHTS.attendance}% + proposals ×{DEPARTMENT_WEIGHTS.proposals}%.
        Grades: A+ ≥95 · A 90–94 · B 80–89 · C 70–79 · D 60–69 · E &lt;60.
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {departments.map((d, i) => {
          const g = goals.find((x) => x.departmentId === d.id);
          const p = perfs[i];
          return (
            <Card key={d.id}>
              <div className="flex items-start justify-between">
                <SectionTitle>{d.name}</SectionTitle>
                <div className="flex items-center gap-2">
                  <Pill value={p.score >= 80 ? "OK" : p.score >= 70 ? "WARN" : "DANGER"} label={`Score ${p.score}`} />
                  <span className="badge bg-slate-100 text-slate-700">{p.grade}</span>
                  <span className="badge bg-indigo-100 text-indigo-700">×{p.multiplier}</span>
                </div>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-1 text-xs text-ink-muted">
                <div>KPI: <b className="text-ink">{Math.round(p.components.kpi)}%</b></div>
                <div>Jobs: <b className="text-ink">{p.validJobs}{p.jobTarget ? `/${p.jobTarget}` : ""}</b></div>
                <div>Accuracy: <b className="text-ink">{Math.round(p.components.accuracy)}%</b></div>
                <div>Attendance: <b className="text-ink">{Math.round(p.components.attendance)}%</b></div>
                <div>Proposals: <b className="text-ink">{Math.round(p.components.proposals)}%</b></div>
                <div>Teamwork: <b className="text-ink">{Math.round(p.components.teamwork)}%</b></div>
              </div>
              {canEdit ? (
                <form action={saveDepartmentGoal} className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="departmentId" value={d.id} />
                  <input type="hidden" name="period" value={period} />
                  <div><label className="label">Job volume target</label><input name="jobVolumeTarget" type="number" className="input" defaultValue={g?.jobVolumeTarget ?? 0} /></div>
                  <div><label className="label">Proposal target</label><input name="proposalTarget" type="number" className="input" defaultValue={g?.proposalTarget ?? 1} /></div>
                  <div><label className="label">Revenue contribution (RM)</label><input name="revenueContributionTarget" type="number" step="0.01" className="input" defaultValue={g?.revenueContributionTarget ?? 0} /></div>
                  <div><label className="label">GP contribution (RM)</label><input name="gpContributionTarget" type="number" step="0.01" className="input" defaultValue={g?.gpContributionTarget ?? 0} /></div>
                  <div><label className="label">KPI achievement target %</label><input name="kpiAchievementTargetPct" type="number" className="input" defaultValue={g?.kpiAchievementTargetPct ?? 100} /></div>
                  <div><label className="label">Accuracy target %</label><input name="accuracyTargetPct" type="number" className="input" defaultValue={g?.accuracyTargetPct ?? 95} /></div>
                  <div className="col-span-2"><label className="label">Notes</label><input name="notes" className="input" defaultValue={g?.notes ?? ""} /></div>
                  <div className="col-span-2"><button className="btn-primary w-full">Save {d.name} targets</button></div>
                </form>
              ) : (
                <div className="border-t border-slate-100 pt-3 text-xs text-ink-muted">
                  Targets: {g ? `${g.jobVolumeTarget} jobs · RM ${g.gpContributionTarget.toLocaleString()} GP · ${g.proposalTarget} proposals` : "not set for this month"}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
