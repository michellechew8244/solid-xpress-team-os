import Link from "next/link";
import { getBossDashboard } from "@/services/dashboard";
import { rm, pct } from "@/lib/format";
import { Avatar, Card, Pill, Progress, SectionTitle, StatCard } from "@/components/ui";
import { KpiBarChart, CompareBars, TrendLine, DonutChart } from "@/components/charts";
import { AiPanel } from "@/components/AiPanel";

export async function BossDashboard({ name }: { name: string }) {
  const d = await getBossDashboard();
  const revPct = Math.round((d.revenueAchieved / d.revenueTarget) * 100);
  const gpPct = Math.round((d.gpAchieved / d.gpTarget) * 100);

  const queueCards: { label: string; value: number }[] = [
    { label: "Billing pending", value: d.queues.billingPending },
    { label: "Collection pending", value: d.queues.collectionPending },
    { label: "Unbilled jobs", value: d.queues.unbilledJobs },
    { label: "Permit pending", value: d.queues.permitPending },
    { label: "Customs pending", value: d.queues.customsPending },
    { label: "Haulage pending", value: d.queues.haulagePending },
    { label: "Runner docs pending", value: d.queues.runnerPending },
    { label: "Customer complaints", value: d.complaints },
  ];

  return (
    <div className="space-y-6">
      {/* Performance & people metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Company Performance Score" value={d.companyScore} sub="avg monthly grade score" rag={d.companyScore >= 80 ? "ok" : d.companyScore >= 70 ? "warn" : "danger"} icon="🏁" />
        <StatCard label="Total Staff" value={d.totalStaff} sub="active employees" rag="neutral" icon="👥" />
        <StatCard label="Diamonds Issued" value={d.pointsIssued.toLocaleString()} sub="this month" rag="ok" icon="💎" />
        <StatCard label="Diamonds Deducted" value={d.pointsDeducted.toLocaleString()} sub="this month" rag={d.pointsDeducted > 100 ? "danger" : "warn"} icon="⚠️" />
      </div>

      {/* Financial + operational metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Monthly Revenue" value={rm(d.revenueAchieved)} sub={`Target ${rm(d.revenueTarget)} · ${pct(revPct)}`} rag={revPct >= 90 ? "ok" : revPct >= 70 ? "warn" : "danger"} icon="💰" />
        <StatCard label="Gross Profit" value={rm(d.gpAchieved)} sub={`Target ${rm(d.gpTarget)} · ${pct(gpPct)}`} rag={gpPct >= 90 ? "ok" : gpPct >= 70 ? "warn" : "danger"} icon="📈" />
        <StatCard label="Overdue Tasks" value={d.overdueCount} sub="Across all departments" rag={d.overdueCount === 0 ? "ok" : d.overdueCount < 5 ? "warn" : "danger"} icon="⏰" />
        <StatCard label="Staff Needing Coaching" value={d.coachingNeeded} sub="open coaching records" rag={d.coachingNeeded === 0 ? "ok" : d.coachingNeeded < 4 ? "warn" : "danger"} icon="🎓" />
      </div>

      {/* Reward & lucky-draw metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Rewards Redeemed" value={d.rewardsRedeemedCount} sub="approved this month" rag="neutral" icon="🎁" />
        <StatCard label="Redemptions Pending" value={d.pendingRedemptions} sub="awaiting approval" rag={d.pendingRedemptions === 0 ? "ok" : "warn"} icon="⏳" />
        <StatCard label="Lucky Draw Entries" value={d.luckyEntries} sub={`${d.luckyParticipants} participants`} rag="neutral" icon="🎰" />
        <StatCard label="Reward Cost Guide" value={rm(d.gpAchieved * 0.015)} sub="GP × 1.5%" rag="neutral" icon="💵" />
      </div>

      {/* Trend + grade distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Monthly Diamonds Trend (last 6 weeks)</SectionTitle>
          <TrendLine data={d.monthlyTrend} />
        </Card>
        <Card>
          <SectionTitle>Staff by Grade</SectionTitle>
          {d.gradeDistribution.some((g) => g.value > 0) ? (
            <DonutChart data={d.gradeDistribution.filter((g) => g.value > 0)} />
          ) : (
            <p className="text-sm text-ink-muted">No reviews generated yet.</p>
          )}
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Revenue vs Gross Profit Target</SectionTitle>
          <CompareBars
            data={[
              { name: "Revenue", target: d.revenueTarget, actual: d.revenueAchieved },
              { name: "Gross Profit", target: d.gpTarget, actual: d.gpAchieved },
            ]}
          />
        </Card>
        <Card>
          <SectionTitle>Department KPI Achievement</SectionTitle>
          {d.deptKpi.length ? <KpiBarChart data={d.deptKpi} /> : <p className="text-sm text-ink-muted">No KPI results yet.</p>}
        </Card>
      </div>

      {/* Operational queues */}
      <Card>
        <SectionTitle>Operational Status (Red / Yellow / Green)</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {queueCards.map((q) => {
            const rag = q.value === 0 ? "ok" : q.value <= 3 ? "warn" : "danger";
            return (
              <div key={q.label} className={`rounded-lg border-l-4 bg-slate-50 p-3 ${rag === "ok" ? "border-l-ok" : rag === "warn" ? "border-l-warn" : "border-l-danger"}`}>
                <div className="text-2xl font-bold text-ink">{q.value}</div>
                <div className="text-xs text-ink-muted">{q.label}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Top / bottom staff */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle action={<Link href="/leaderboard" className="text-xs font-semibold text-brand-600">View leaderboard →</Link>}>
            🏆 Top 10 Performing Staff
          </SectionTitle>
          <StaffList rows={d.topStaff} tone="ok" />
        </Card>
        <Card>
          <SectionTitle>🛟 Bottom 10 — Needs Coaching</SectionTitle>
          <StaffList rows={d.bottomStaff} tone="danger" />
        </Card>
      </div>

      {/* Department ranking + reward budget */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Weekly Department Ranking (diamonds this month)</SectionTitle>
          <div className="space-y-2">
            {d.deptRanking.map((r, i) => {
              const max = d.deptRanking[0]?.value || 1;
              return (
                <div key={r.name} className="flex items-center gap-3">
                  <span className="w-5 text-sm font-bold text-ink-muted">{i + 1}</span>
                  <span className="w-44 truncate text-sm">{r.name}</span>
                  <div className="flex-1"><Progress value={(r.value / max) * 100} /></div>
                  <span className="w-16 text-right text-sm font-semibold">{r.value}</span>
                </div>
              );
            })}
            {!d.deptRanking.length && <p className="text-sm text-ink-muted">No diamonds recorded yet.</p>}
          </div>
        </Card>
        <Card>
          <SectionTitle>Monthly Reward Budget</SectionTitle>
          <div className="text-3xl font-bold text-ink">{rm(d.gpAchieved * 0.015)}</div>
          <div className="text-xs text-ink-muted">recommended budget · GP × 1.5%</div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-ink-muted">Diamonds redeemed (approved)</span>
            <span className="font-semibold text-brand-700">{d.rewardBudgetUsed.toLocaleString()} 💎</span>
          </div>
          <div className="mt-2 text-xs text-ink-muted">Sustainable range: {rm(d.gpAchieved * 0.01)} – {rm(d.gpAchieved * 0.02)} (1–2% of GP)</div>
        </Card>
      </div>

      <AiPanel
        scope="boss"
        title="AI: Weekly Company Summary"
        context={{
          revenuePct: revPct,
          gpPct,
          overdue: d.overdueCount,
          complaints: d.complaints,
          weakDepartments: d.deptKpi.filter((x) => x.value < 80).map((x) => x.name),
          bottomStaff: d.bottomStaff.slice(0, 5).map((s) => s.name),
        }}
      />
    </div>
  );
}

function StaffList({
  rows,
  tone,
}: {
  rows: { id: string; name: string; avatarColor: string; currentPoints: number; growthLevel: number; department: { name: string } | null }[];
  tone: "ok" | "danger";
}) {
  if (!rows.length) return <p className="text-sm text-ink-muted">No staff yet.</p>;
  return (
    <div className="space-y-1">
      {rows.map((s, i) => (
        <div key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
          <span className="w-4 text-xs font-bold text-ink-muted">{i + 1}</span>
          <Avatar name={s.name} color={s.avatarColor} size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{s.name}</div>
            <div className="truncate text-xs text-ink-muted">{s.department?.name ?? "—"}</div>
          </div>
          <Pill value={tone === "ok" ? "OK" : "DANGER"} label={`${s.currentPoints} 💎`} />
        </div>
      ))}
    </div>
  );
}
