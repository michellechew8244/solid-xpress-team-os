import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { collectedGPForUser } from "@/lib/commission";
import { Card, PageHeader, SectionTitle, StatCard, Pill } from "@/components/ui";
import { ComputeCommissionForm, CommissionRowActions } from "@/components/CommissionControls";

const rm = (n: number) => `RM ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const STATUS_PILL: Record<string, string> = { PENDING: "WAITING_EXTERNAL", FINANCE_CONFIRMED: "IN_PROGRESS", APPROVED: "COMPLETED", HELD: "REJECTED", PAID: "COMPLETED" };

export default async function CommissionPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const boss = isBoss(me.role);
  const finance = me.role === "FINANCE_ADMIN";
  const manager = boss || finance;

  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();

  const records = await prisma.commissionRecord.findMany({
    where: { period, ...(manager ? {} : { userId: me.id }) },
    orderBy: { amount: "desc" },
  });
  const users = await prisma.user.findMany({ where: { id: { in: records.map((r) => r.userId) } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  // Salespeople for the compute form: commission-eligible position's department members + anyone with sales GP.
  const salesPeople = manager
    ? await prisma.user.findMany({
        where: { isActive: true, NOT: { email: { endsWith: "@solidxpress.system" } }, department: { name: { contains: "sales", mode: "insensitive" } } },
        select: { id: true, name: true }, orderBy: { name: "asc" },
      })
    : [];

  // My live collected GP (for sales staff).
  const myGP = await collectedGPForUser(me.id, period);

  return (
    <>
      <PageHeader title="💰 Sales Commission" subtitle={`Commission is paid on COLLECTED gross profit, confirmed by Finance and approved by Boss · ${period}`} />

      <form className="mb-4 flex items-center gap-2" action="/commission" method="get">
        <input type="month" name="period" defaultValue={period} className="input w-44" />
        <button className="btn-ghost">View month</button>
      </form>

      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Collected GP" value={rm(myGP.collectedGP)} icon="💵" rag="ok" />
        <StatCard label="GP Awaiting Collection" value={rm(myGP.uncollectedGP)} icon="⏳" rag={myGP.uncollectedGP > 0 ? "warn" : "ok"} />
        <StatCard label="Loss-Making Jobs (excluded)" value={myGP.lossMakingJobs} icon="⚠️" rag={myGP.lossMakingJobs ? "warn" : "ok"} />
        <StatCard label="Jobs This Month" value={myGP.jobCount} icon="📦" rag="neutral" />
      </div>

      <Card className="mb-5 p-4 text-xs text-ink-muted">
        <b className="text-ink">Commission tiers (of collected GP):</b> &lt;70% target → 0% · 70–89% → 1% · 90–99% → 2% · 100–119% → 3% · 120–149% → 4% · ≥150% → 5% (Boss approval required).
        Eligibility: invoice issued, payment collected, job profitable, GP confirmed by Finance, no unresolved complaint/handover issue.
      </Card>

      {manager && (
        <Card className="mb-5">
          <SectionTitle>Compute commission — {period}</SectionTitle>
          {salesPeople.length === 0
            ? <p className="text-sm text-ink-muted">No staff in a Sales department yet. Assign salespeople to the Sales department first.</p>
            : <ComputeCommissionForm people={salesPeople} period={period} />}
        </Card>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                <th className="px-4 py-3">Salesperson</th><th className="px-3">GP Target</th><th className="px-3">Collected GP</th>
                <th className="px-3">Achievement</th><th className="px-3">Tier</th><th className="px-3">Commission</th><th className="px-3">Status</th>
                {manager && <th className="px-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-semibold">{nameById.get(r.userId) ?? "—"}</td>
                  <td className="px-3 text-xs">{rm(r.gpTarget)}</td>
                  <td className="px-3 text-xs">{rm(r.gpCollected)}</td>
                  <td className="px-3"><Pill value={r.achievementPct >= 100 ? "OK" : r.achievementPct >= 70 ? "WARN" : "DANGER"} label={`${r.achievementPct}%`} /></td>
                  <td className="px-3 text-xs font-bold">{r.tierPct}%</td>
                  <td className="px-3 font-bold text-brand-700">{rm(r.amount)}</td>
                  <td className="px-3">
                    <Pill value={STATUS_PILL[r.status] ?? "WAITING_EXTERNAL"} label={r.status.replace(/_/g, " ")} />
                    {r.holdReason && <div className="mt-0.5 text-[10px] text-danger">{r.holdReason}</div>}
                  </td>
                  {manager && (
                    <td className="px-3">
                      <CommissionRowActions id={r.id} status={r.status} canFinance={finance || boss} canBoss={boss} needsBossFor150 achievement={r.achievementPct} />
                    </td>
                  )}
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={manager ? 8 : 7} className="px-4 py-8 text-center text-sm text-ink-muted">No commission records for {period}{manager ? " — compute one above" : ""}.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
