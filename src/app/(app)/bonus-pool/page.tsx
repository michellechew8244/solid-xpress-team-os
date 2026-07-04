import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { computeCompanyPerformance } from "@/lib/performance";
import { DEFAULT_ALLOCATIONS } from "@/lib/bonus-pool";
import { Card, PageHeader, SectionTitle, StatCard, Pill } from "@/components/ui";
import { PoolActions, OverrideExclusionButton } from "@/components/BonusPoolControls";

const rm = (n: number) => `RM ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function BonusPoolPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const boss = isBoss(me.role);

  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();

  const [pool, company, goal] = await Promise.all([
    prisma.bonusPool.findUnique({ where: { period }, include: { allocations: { include: { individuals: true }, orderBy: { allocationPct: "desc" } } } }),
    computeCompanyPerformance(period),
    prisma.companyGoal.findUnique({ where: { period } }),
  ]);
  const userIds = pool?.allocations.flatMap((a) => a.individuals.map((i) => i.userId)) ?? [];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const myShares = pool?.allocations.flatMap((a) => a.individuals.filter((i) => i.userId === me.id)) ?? [];
  const myShare = myShares.reduce((s, x) => s + (x.excluded ? 0 : x.amount), 0);

  return (
    <>
      <PageHeader title="🎁 Team Bonus Pool" subtitle={`Rewarding the non-sales teams that protect GP, customers and operations · ${period}`} />

      <form className="mb-4 flex items-center gap-2" action="/bonus-pool" method="get">
        <input type="month" name="period" defaultValue={period} className="input w-44" />
        <button className="btn-ghost">View month</button>
      </form>

      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Company Score" value={`${company.score} (${company.grade})`} icon="🏢" rag={company.score >= 80 ? "ok" : "warn"} />
        <StatCard label="Multiplier" value={`×${company.multiplier}`} icon="✖️" rag={company.multiplier >= 1 ? "ok" : "warn"} />
        <StatCard label="Pool Amount" value={pool ? rm(pool.poolAmount) : "—"} icon="🎁" rag="neutral" />
        <StatCard label="My Share" value={myShare > 0 ? rm(myShare) : "—"} icon="💰" rag={myShare > 0 ? "ok" : "neutral"} />
      </div>

      <Card className="mb-5 p-4 text-xs text-ink-muted">
        <b className="text-ink">Formula:</b> Pool = collected GP × pool % × company multiplier. Department bonus = pool × allocation % × department score multiplier
        (&lt;70 → ×0 · 70–79 → ×0.5 · 80–89 → ×1 · 90–94 → ×1.2 · ≥95 → ×1.5). Individual share = department bonus × (your score ÷ team total scores).
        Default allocations: {DEFAULT_ALLOCATIONS.map((a) => `${a.label} ${a.pct}%`).join(" · ")}.
        Staff with red-line issues are excluded unless Boss overrides with a reason.
      </Card>

      {boss && (
        <Card className="mb-5">
          <SectionTitle>Manage pool — {period} {pool && <Pill value={pool.status === "APPROVED" ? "COMPLETED" : "IN_PROGRESS"} label={pool.status} />}</SectionTitle>
          <PoolActions period={period} poolPct={pool?.poolPct ?? goal?.bonusPoolPct ?? 2} status={pool?.status ?? null} />
          {pool && <p className="mt-2 text-xs text-ink-muted">Collected GP {rm(pool.collectedGP)} × {pool.poolPct}% × multiplier {pool.companyMultiplier} = <b className="text-ink">{rm(pool.poolAmount)}</b></p>}
        </Card>
      )}

      {pool ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {pool.allocations.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between">
                <SectionTitle>{a.label}</SectionTitle>
                <div className="flex gap-1">
                  <span className="badge bg-slate-100 text-slate-700">{a.allocationPct}%</span>
                  {a.departmentId && <Pill value={a.deptScore >= 80 ? "OK" : a.deptScore >= 70 ? "WARN" : "DANGER"} label={`Score ${a.deptScore}`} />}
                  <span className="badge bg-indigo-100 text-indigo-700">×{a.multiplier}</span>
                  <span className="badge bg-emerald-100 text-emerald-700">{rm(a.amount)}</span>
                </div>
              </div>
              {a.individuals.length > 0 ? (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {a.individuals.sort((x, y) => y.amount - x.amount).map((i) => (
                      <tr key={i.id}>
                        <td className="py-1.5">{nameById.get(i.userId) ?? "—"}</td>
                        <td className="text-xs text-ink-muted">score {i.score}</td>
                        <td className="text-xs text-ink-muted">{Math.round(i.weight * 100)}%</td>
                        <td className="text-right font-semibold">{i.excluded ? <span className="text-danger text-xs">Excluded: {i.excludeReason}</span> : rm(i.amount)}</td>
                        {boss && i.excluded && pool.status === "DRAFT" && <td className="pl-2 text-right"><OverrideExclusionButton id={i.id} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-ink-muted">{a.departmentId ? "No active staff in this department." : "Reserved for management decisions."}</p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-ink-muted">No bonus pool computed for {period} yet{boss ? " — use the panel above" : ""}.</Card>
      )}
    </>
  );
}
