import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { dateTime } from "@/lib/format";
import { resultBreakdown, RESULT_TYPES } from "@/lib/result-kpi";
import { Card, PageHeader, SectionTitle, StatCard, Pill, Progress } from "@/components/ui";
import { LogResultForm, ReviewResultForm } from "@/components/ResultControls";

const STATUS_PILL: Record<string, string> = { SUBMITTED: "WAITING_EXTERNAL", APPROVED: "COMPLETED", REJECTED: "REJECTED" };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const manager = isBoss(me.role) || me.role === "DEPARTMENT_HEAD" || me.role === "HR_ADMIN";

  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();

  const scope = manager
    ? await prisma.user.findMany({ where: { isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] }, NOT: { email: { endsWith: "@solidxpress.system" } }, ...(me.role === "DEPARTMENT_HEAD" && me.departmentId ? { departmentId: me.departmentId } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  const nameById = new Map([...scope, { id: me.id, name: me.name }].map((u) => [u.id, u.name]));

  const [records, my] = await Promise.all([
    prisma.resultRecord.findMany({
      where: { period, userId: manager ? { in: [...scope.map((u) => u.id), me.id] } : me.id },
      orderBy: [{ resultStatus: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    resultBreakdown(me.id, period),
  ]);
  const pendingReview = records.filter((r) => r.resultStatus === "SUBMITTED");
  const typeLabel = new Map(RESULT_TYPES.map((t) => [t.key, t.label]));
  const typeDiamonds = new Map(RESULT_TYPES.map((t) => [t.key, t.diamonds]));

  return (
    <>
      <PageHeader title="🎯 Result Centre" subtitle={`Results are the KPI — tasks are only evidence. Log outcomes, pass the quality gate, earn result-based diamonds · ${period}`} />

      <form className="mb-4 flex items-center gap-2" action="/results" method="get">
        <input type="month" name="period" defaultValue={period} className="input w-44" />
        <button className="btn-ghost">View month</button>
      </form>

      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Result Score" value={my.resultScore || "—"} icon="🎯" rag={my.resultScore >= 80 ? "ok" : my.resultScore >= 60 ? "warn" : "neutral"} />
        <StatCard label="Approved Results" value={my.recordCount} icon="✅" rag="neutral" />
        <StatCard label="Quality Gate Avg" value={`${my.avgQualityGate}%`} icon="🛡️" rag={my.avgQualityGate >= 95 ? "ok" : "warn"} />
        <StatCard label="Inquiry Resolution" value={my.inquiry.due > 0 ? `${my.inquiry.resolved}/${my.inquiry.due} (${my.inquiry.ratePct}%)` : "—"} icon="📨" rag={my.inquiry.due === 0 || my.inquiry.ratePct >= 90 ? "ok" : "warn"} />
      </div>

      {/* My result areas */}
      {my.profileType && (
        <Card className="mb-5">
          <SectionTitle>My result areas — {my.profileType.replace(/_/g, " ")}</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {my.areas.map((a) => (
              <div key={a.area} className="flex items-center gap-2 text-sm">
                <div className="w-52 truncate" title={a.area}>{a.area} <span className="text-[10px] text-ink-muted">({a.weight}%)</span></div>
                <div className="flex-1"><Progress value={a.score ?? 0} rag={a.score === null ? undefined : a.score >= 80 ? "ok" : a.score >= 60 ? "warn" : "danger"} /></div>
                <span className="w-14 text-right text-xs font-semibold">{a.score === null ? "no data" : `${a.score}%`}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">Quality gate: clean result = 100% · minor internal fix = 80% · complaint = 50% · extra cost = 0–50% · hidden issue = 0% + deduction.</p>
        </Card>
      )}

      <Card className="mb-5">
        <SectionTitle>Log a result</SectionTitle>
        <LogResultForm people={manager ? scope : []} period={period} />
      </Card>

      {manager && pendingReview.length > 0 && (
        <Card className="mb-5 border-l-4 border-l-warn">
          <SectionTitle>⏳ Results awaiting review ({pendingReview.length})</SectionTitle>
          {pendingReview.map((r) => (
            <div key={r.id} className="border-b border-slate-100 py-2">
              <div className="text-sm font-semibold">{nameById.get(r.userId) ?? "—"} · {typeLabel.get(r.resultType) ?? r.resultType}</div>
              <div className="text-xs text-ink-muted">
                {r.relatedJobNo && `Job ${r.relatedJobNo} · `}{r.relatedCustomer && `${r.relatedCustomer} · `}{r.businessImpact ?? "—"}
                {r.evidenceUrl && <> · <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">evidence</a></>}
              </div>
              <ReviewResultForm id={r.id} suggestedDiamonds={typeDiamonds.get(r.resultType) ?? 50} />
            </div>
          ))}
        </Card>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                <th className="px-4 py-3">Staff</th><th className="px-3">Result</th><th className="px-3">Job / Customer</th>
                <th className="px-3">Quality Gate</th><th className="px-3">Final Score</th><th className="px-3">💎</th><th className="px-3">Status</th><th className="px-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-xs font-semibold">{nameById.get(r.userId) ?? "—"}</td>
                  <td className="px-3 text-xs">{typeLabel.get(r.resultType) ?? r.resultType}</td>
                  <td className="px-3 text-xs text-ink-muted">{r.relatedJobNo ?? "—"}{r.relatedCustomer ? ` · ${r.relatedCustomer}` : ""}</td>
                  <td className="px-3 text-xs">{r.resultStatus === "APPROVED" ? `${r.qualityGatePercent}%` : "—"}</td>
                  <td className="px-3 text-xs font-bold">{r.resultStatus === "APPROVED" ? r.finalResultScore : "—"}</td>
                  <td className="px-3 text-xs text-ok">{r.diamondsAwarded ? `+${r.diamondsAwarded}` : "—"}</td>
                  <td className="px-3"><Pill value={STATUS_PILL[r.resultStatus] ?? "WAITING_EXTERNAL"} label={r.resultStatus} /></td>
                  <td className="px-3 text-xs text-ink-muted">{dateTime(r.createdAt)}</td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-ink-muted">No results logged for {period} yet — log your first outcome above.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
