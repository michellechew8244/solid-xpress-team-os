import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { getMonthlyReport } from "./actions";
import { ReportExportButton } from "@/components/ReportExportButton";
import { requireFeature } from "@/lib/features";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireFeature("reports");
  const user = await getCurrentUser();
  if (!user) return null;

  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();
  const rows = await getMonthlyReport(period);

  const totalEarned = rows.reduce((s, r) => s + r.earned, 0);
  const totalDeducted = rows.reduce((s, r) => s + r.deducted, 0);
  const scored = rows.filter((r) => r.score !== null);
  const avgScore = scored.length ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length) : 0;
  const totalLate = rows.reduce((s, r) => s + r.late, 0);

  // Department rollup
  const byDept = new Map<string, { staff: number; earned: number; deducted: number; late: number; absent: number }>();
  for (const r of rows) {
    const d = byDept.get(r.department) ?? { staff: 0, earned: 0, deducted: 0, late: 0, absent: 0 };
    d.staff++; d.earned += r.earned; d.deducted += r.deducted; d.late += r.late; d.absent += r.absent;
    byDept.set(r.department, d);
  }

  return (
    <>
      <PageHeader
        title="Monthly Performance Report"
        subtitle={`Company overview · ${period}`}
        action={<div className="flex items-end gap-2">
          <form method="get"><input name="period" type="month" defaultValue={period} className="input" /><button className="btn-ghost ml-2 px-3 py-1.5 text-sm">Go</button></form>
          <ReportExportButton period={period} />
        </div>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Diamonds Earned" value={totalEarned.toLocaleString()} icon="💎" rag="ok" />
        <StatCard label="Diamonds Deducted" value={totalDeducted.toLocaleString()} icon="⚠️" rag={totalDeducted ? "warn" : "ok"} />
        <StatCard label="Avg Review Score" value={scored.length ? avgScore : "—"} icon="🏁" rag="neutral" />
        <StatCard label="Late Arrivals" value={totalLate} icon="⏰" rag={totalLate ? "warn" : "ok"} />
      </div>

      <Card className="mb-6 p-0">
        <div className="p-5 pb-2"><SectionTitle>By Department</SectionTitle></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
              <th className="px-4 py-2">Department</th><th className="px-4 py-2 text-right">Staff</th><th className="px-4 py-2 text-right">💎 Earned</th><th className="px-4 py-2 text-right">💎 Deducted</th><th className="px-4 py-2 text-right">Late</th><th className="px-4 py-2 text-right">Absent</th>
            </tr></thead>
            <tbody>
              {[...byDept.entries()].map(([name, d]) => (
                <tr key={name} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium text-ink">{name}</td>
                  <td className="px-4 py-2 text-right">{d.staff}</td>
                  <td className="px-4 py-2 text-right font-semibold text-ok">+{d.earned}</td>
                  <td className="px-4 py-2 text-right text-danger">-{d.deducted}</td>
                  <td className="px-4 py-2 text-right">{d.late}</td>
                  <td className="px-4 py-2 text-right">{d.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0">
        <div className="p-5 pb-2"><SectionTitle>By Staff ({rows.length})</SectionTitle></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
              <th className="px-4 py-2">Staff</th><th className="px-4 py-2">Department</th><th className="px-4 py-2 text-right">💎 Earned</th><th className="px-4 py-2 text-right">💎 Deducted</th><th className="px-4 py-2">Grade</th><th className="px-4 py-2 text-right">Score</th><th className="px-4 py-2 text-right">P / L / A / Lv</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-2 text-xs text-ink-muted">{r.department}</td>
                  <td className="px-4 py-2 text-right font-semibold text-ok">+{r.earned}</td>
                  <td className="px-4 py-2 text-right text-danger">-{r.deducted}</td>
                  <td className="px-4 py-2">{r.grade}</td>
                  <td className="px-4 py-2 text-right">{r.score ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-xs">{r.present} / {r.late} / {r.absent} / {r.leave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
