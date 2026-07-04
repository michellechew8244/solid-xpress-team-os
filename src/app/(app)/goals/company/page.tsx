import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { currentPeriod } from "@/lib/enums";
import { computeCompanyPerformance, COMPANY_WEIGHTS } from "@/lib/performance";
import { Card, PageHeader, SectionTitle, StatCard, Pill } from "@/components/ui";
import { saveCompanyGoal, saveManualActuals, approveCompanyScore } from "../actions";

const rm = (n: number) => `RM ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default async function CompanyGoalPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!isBoss(me.role)) redirect("/dashboard");

  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();
  const [goal, perf, computed] = await Promise.all([
    prisma.companyGoal.findUnique({ where: { period } }),
    prisma.companyPerformance.findUnique({ where: { period } }),
    computeCompanyPerformance(period),
  ]);

  const COMPONENT_LABELS: Record<keyof typeof COMPANY_WEIGHTS, string> = {
    revenue: "Revenue", grossProfit: "Gross Profit", collection: "Collection", satisfaction: "Customer Satisfaction",
    accuracy: "Operation Accuracy", shortBilling: "Short Billing Control", attendance: "Attendance Discipline", proposals: "Proposals / Improvement",
  };

  const fields: { name: string; label: string; value: number; step?: string }[] = [
    { name: "revenueTarget", label: "Revenue Target (RM)", value: goal?.revenueTarget ?? 0 },
    { name: "gpTarget", label: "Gross Profit Target (RM)", value: goal?.gpTarget ?? 0 },
    { name: "gpMarginTargetPct", label: "GP Margin Target %", value: goal?.gpMarginTargetPct ?? 25 },
    { name: "collectionTarget", label: "Collection Target (RM)", value: goal?.collectionTarget ?? 0 },
    { name: "newCustomerTarget", label: "New Customer Target", value: goal?.newCustomerTarget ?? 0 },
    { name: "retentionTargetPct", label: "Retention Target %", value: goal?.retentionTargetPct ?? 90 },
    { name: "satisfactionTargetPct", label: "Customer Satisfaction Target %", value: goal?.satisfactionTargetPct ?? 90 },
    { name: "errorReductionTargetPct", label: "Operation Accuracy Target %", value: goal?.errorReductionTargetPct ?? 95 },
    { name: "shortBillingControlTargetPct", label: "Short Billing Control Target %", value: goal?.shortBillingControlTargetPct ?? 100 },
    { name: "onTimeBillingTargetPct", label: "On-Time Billing Target %", value: goal?.onTimeBillingTargetPct ?? 95 },
    { name: "proposalAcceptedTarget", label: "Proposals Accepted Target", value: goal?.proposalAcceptedTarget ?? 3 },
    { name: "attendanceTargetPct", label: "Attendance Discipline Target %", value: goal?.attendanceTargetPct ?? 95 },
    { name: "departmentScoreTarget", label: "Department Score Target", value: goal?.departmentScoreTarget ?? 80 },
    { name: "companyScoreTarget", label: "Company Score Target", value: goal?.companyScoreTarget ?? 80 },
    { name: "rewardBudgetPct", label: "Reward Budget %", value: goal?.rewardBudgetPct ?? 2 },
    { name: "commissionBudgetPct", label: "Commission Budget %", value: goal?.commissionBudgetPct ?? 3 },
    { name: "bonusPoolPct", label: "Bonus Pool %", value: goal?.bonusPoolPct ?? 2 },
  ];

  return (
    <>
      <PageHeader title="🏢 Company Goal Centre" subtitle={`Set targets and track the company score · ${period}`} />

      {/* Month picker */}
      <form className="mb-4 flex items-center gap-2" action="/goals/company" method="get">
        <input type="month" name="period" defaultValue={period} className="input w-44" />
        <button className="btn-ghost">View month</button>
      </form>

      {/* Live company score */}
      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Company Score" value={computed.score} icon="🏢" rag={computed.score >= 80 ? "ok" : computed.score >= 70 ? "warn" : "danger"} />
        <StatCard label="Grade" value={computed.grade} icon="🎓" rag="neutral" />
        <StatCard label="Bonus Multiplier" value={`×${computed.multiplier}`} icon="✖️" rag={computed.multiplier >= 1 ? "ok" : "warn"} />
        <StatCard label="Collected" value={rm(computed.actuals.collection)} icon="💰" rag="neutral" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Score breakdown */}
        <Card>
          <SectionTitle>Score Breakdown ({period})</SectionTitle>
          {!computed.hasGoal && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">No goal set for this month yet — achievements show 0/100 defaults. Save the targets below.</p>}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted"><th className="py-2">Component</th><th>Weight</th><th>Achievement</th><th>Contribution</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(Object.keys(COMPANY_WEIGHTS) as (keyof typeof COMPANY_WEIGHTS)[]).map((k) => (
                <tr key={k}>
                  <td className="py-1.5">{COMPONENT_LABELS[k]}</td>
                  <td className="text-xs text-ink-muted">{COMPANY_WEIGHTS[k]}%</td>
                  <td><Pill value={computed.achievements[k] >= 100 ? "OK" : computed.achievements[k] >= 70 ? "WARN" : "DANGER"} label={`${Math.round(computed.achievements[k])}%`} /></td>
                  <td className="text-xs font-semibold">{(Math.min(computed.achievements[k], 120) * COMPANY_WEIGHTS[k] / 100).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-ink-muted">
            <div>Revenue: <b className="text-ink">{rm(computed.actuals.revenue)}</b></div>
            <div>GP: <b className="text-ink">{rm(computed.actuals.gp)}</b></div>
            <div>Proposals: <b className="text-ink">{computed.actuals.proposalCount}</b></div>
          </div>
          {/* Manual actuals + approve */}
          <form action={saveManualActuals} className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="period" value={period} />
            <div><label className="label">Customer satisfaction % (manual)</label><input name="satisfactionPct" type="number" step="0.1" className="input" defaultValue={perf?.satisfactionPct ?? ""} /></div>
            <div><label className="label">Operation accuracy % (manual)</label><input name="accuracyPct" type="number" step="0.1" className="input" defaultValue={perf?.accuracyPct ?? ""} /></div>
            <div className="col-span-2 flex items-center gap-2">
              <button className="btn-ghost">Save actuals</button>
              {perf?.status === "APPROVED"
                ? <span className="badge bg-green-100 text-green-700">Score approved ✓</span>
                : <button formAction={async () => { "use server"; await approveCompanyScore(period); }} className="btn-primary">Approve company score</button>}
            </div>
          </form>
          <div className="mt-3 text-xs text-ink-muted">
            Multiplier bands: &lt;70 → ×0 · 70–79 → ×0.5 · 80–89 → ×1.0 · 90–94 → ×1.2 · ≥95 → ×1.5
          </div>
        </Card>

        {/* Goal form */}
        <Card>
          <SectionTitle>{goal ? "Edit" : "Set"} Targets — {period}</SectionTitle>
          <form action={saveCompanyGoal} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="period" value={period} />
            {fields.map((f) => (
              <div key={f.name}><label className="label">{f.label}</label><input name={f.name} type="number" step="0.01" className="input" defaultValue={f.value} /></div>
            ))}
            <div className="col-span-2"><button className="btn-primary w-full">Save company goal</button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
