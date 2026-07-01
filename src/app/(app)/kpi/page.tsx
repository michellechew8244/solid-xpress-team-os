import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss, canApproveTasks } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { ragFromPct } from "@/lib/format";
import { Avatar, Card, PageHeader, Pill, Progress, SectionTitle } from "@/components/ui";
import { KpiEntryRow, KpiReviewButtons } from "@/components/KpiForms";

export default async function KpiPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const period = currentPeriod();
  const isManager = canApproveTasks(user.role);

  // ---- My KPI entry (staff + dept heads with a department) ----
  const myKpis = user.departmentId
    ? await prisma.kPI.findMany({
        where: { departmentId: user.departmentId, status: "ACTIVE" },
        include: { results: { where: { userId: user.id, period } } },
        orderBy: { name: "asc" },
      })
    : [];

  // ---- Manager review queue ----
  const reviewQueue = isManager
    ? await prisma.kPIResult.findMany({
        where: {
          period,
          status: "SUBMITTED",
          kpi: isBoss(user.role) ? {} : { departmentId: user.departmentId ?? "" },
        },
        include: { kpi: true, user: true },
        orderBy: { updatedAt: "asc" },
      })
    : [];

  // ---- Department overview ----
  const deptFilter = isBoss(user.role) ? {} : { id: user.departmentId ?? "" };
  const departments = await prisma.department.findMany({
    where: deptFilter,
    include: { kpis: { where: { status: "ACTIVE" }, include: { results: { where: { period } } } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title="KPI Dashboard" subtitle={`Enter actuals, track achievement & points · ${period}`} />

      {myKpis.length > 0 && (
        <Card className="mb-6">
          <SectionTitle>📝 Enter My KPI Actuals</SectionTitle>
          <p className="mb-2 text-xs text-ink-muted">
            KPI Points = achievement rate × multiplier, capped at each KPI&apos;s max. Points are credited to your wallet once your manager approves.
          </p>
          {myKpis.map((k) => (
            <KpiEntryRow
              key={k.id}
              kpi={{ id: k.id, name: k.name, targetValue: k.targetValue, unit: k.unit, maxPoints: k.maxPoints, pointMultiplier: k.pointMultiplier, evidenceRequired: k.evidenceRequired }}
              result={k.results[0] ?? null}
            />
          ))}
        </Card>
      )}

      {reviewQueue.length > 0 && (
        <Card className="mb-6 border-l-4 border-l-warn">
          <SectionTitle>✅ KPI Submissions to Review ({reviewQueue.length})</SectionTitle>
          <div className="divide-y divide-slate-100">
            {reviewQueue.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Avatar name={r.user.name} color={r.user.avatarColor} size={28} />
                  <div>
                    <div className="text-sm font-semibold">{r.user.name}</div>
                    <div className="text-xs text-ink-muted">{r.kpi.name} · actual {r.actualValue} · {r.achievementPct}% → {r.pointsAwarded} pts</div>
                  </div>
                </div>
                <KpiReviewButtons resultId={r.id} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {departments.filter((d) => d.kpis.length > 0).map((d) => {
          const all = d.kpis.flatMap((k) => k.results);
          const deptAvg = all.length ? Math.round(all.reduce((s, r) => s + r.achievementPct, 0) / all.length) : 0;
          return (
            <Card key={d.id}>
              <SectionTitle action={<Pill value={ragFromPct(deptAvg) === "ok" ? "OK" : ragFromPct(deptAvg) === "warn" ? "WARN" : "DANGER"} label={`${deptAvg}% avg`} />}>
                {d.name}
              </SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                      <th className="py-2 pr-2">KPI</th><th className="px-2">Freq</th><th className="px-2">Target</th><th className="px-2 text-center">Max pts</th><th className="w-48 px-2">Achievement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.kpis.map((k) => {
                      const avg = k.results.length ? Math.round(k.results.reduce((s, r) => s + r.achievementPct, 0) / k.results.length) : 0;
                      return (
                        <tr key={k.id}>
                          <td className="py-2 pr-2 font-medium text-ink">{k.name}{k.evidenceRequired && <span className="ml-1 text-xs text-amber-600" title="Evidence required">📎</span>}</td>
                          <td className="px-2 text-xs text-ink-muted">{k.frequency}</td>
                          <td className="px-2 text-ink-soft">{k.targetValue.toLocaleString()} {k.unit ?? ""}</td>
                          <td className="px-2 text-center text-xs text-ok">{k.maxPoints}</td>
                          <td className="px-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1"><Progress value={avg} rag={ragFromPct(avg)} /></div>
                              <span className="w-9 text-right text-xs font-semibold">{avg}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
