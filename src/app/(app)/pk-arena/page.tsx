import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { shortDate } from "@/lib/format";
import { individualStandings, departmentStandings, mostImproved, PK_METRICS } from "@/lib/pk";
import { Avatar, Card, EmptyState, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { requireFeature } from "@/lib/features";

export default async function PKArenaPage() {
  await requireFeature("pk-arena");
  const user = await getCurrentUser();
  if (!user) return null;
  const canManage = isBoss(user.role) || user.role === "HR_ADMIN";

  const campaigns = await prisma.pKCampaign.findMany({
    where: { status: { in: ["UPCOMING", "ACTIVE"] } },
    orderBy: { endDate: "asc" }, take: 6,
  });
  const completed = await prisma.pKCampaign.findMany({
    where: { status: "COMPLETED" },
    include: { results: true },
    orderBy: { updatedAt: "desc" }, take: 3,
  });
  const names = new Map((await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const deptNames = new Map((await prisma.department.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name]));

  return (
    <>
      <PageHeader
        title="⚔️ PK Arena"
        subtitle="Healthy competition that turns daily action into growth, diamonds and recognition."
        action={canManage ? <Link href="/pk-arena/campaigns" className="btn-primary">Manage campaigns</Link> : undefined}
      />

      {campaigns.length === 0 ? (
        <EmptyState title="No active PK campaigns" hint={canManage ? "Launch one from Manage campaigns!" : "Check back soon — a new battle is always around the corner."} />
      ) : (
        <div className="space-y-6">
          {campaigns.map(async (c) => {
            const isDept = c.pkType === "DEPARTMENT";
            const [standings, deptRows, improved] = await Promise.all([
              isDept ? Promise.resolve([]) : individualStandings(c.metricType, c.startDate, c.endDate),
              isDept ? departmentStandings(c.metricType, c.startDate, c.endDate) : Promise.resolve([]),
              isDept ? Promise.resolve([]) : mostImproved(c.metricType, c.startDate, c.endDate),
            ]);
            const top = standings.slice(0, 10);
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-ink">{isDept ? "🏢" : "🧍"} {c.title}</h2>
                      <Pill value={c.status === "ACTIVE" ? "OK" : "WARN"} label={c.status} />
                      <span className="badge bg-slate-100 text-slate-600">{PK_METRICS[c.metricType] ?? c.metricType}</span>
                    </div>
                    {c.description && <p className="text-sm text-ink-muted">{c.description}</p>}
                    <p className="text-xs text-ink-muted">
                      {shortDate(c.startDate)} → {shortDate(c.endDate)} · Rewards: 🥇{c.rewardFirstPlace} 🥈{c.rewardSecondPlace} 🥉{c.rewardThirdPlace} 💎
                      {isDept ? ` · winning dept: +${c.teamReward} 💎/member` : ""}
                    </p>
                  </div>
                </div>

                {/* Standings */}
                <div className="mt-4 divide-y divide-slate-100">
                  {isDept
                    ? deptRows.map((d, i) => (
                        <div key={d.departmentId} className="flex items-center gap-3 py-2">
                          <span className={`w-6 text-center text-sm font-bold ${i < 1 ? "text-amber-500" : "text-ink-muted"}`}>{i + 1}</span>
                          <span className="flex-1 text-sm font-semibold text-ink">{d.name}</span>
                          <span className="text-xs text-ink-muted">{d.members} staff</span>
                          <span className="text-sm font-bold text-brand-700">{d.score}</span>
                        </div>
                      ))
                    : top.map((s, i) => (
                        <div key={s.userId} className={`flex items-center gap-3 py-2 ${s.userId === user.id ? "bg-brand-50/60" : ""}`}>
                          <span className={`w-6 text-center text-sm font-bold ${i < 3 ? "text-amber-500" : "text-ink-muted"}`}>{i + 1}</span>
                          <Avatar name={s.name} color={s.avatarColor} size={26} />
                          <div className="min-w-0 flex-1">
                            <span className="truncate text-sm font-semibold text-ink">{s.name}{s.userId === user.id ? " (you)" : ""}</span>
                            <span className="ml-2 text-xs text-ink-muted">{s.departmentName}</span>
                            {!s.eligible && <span className="ml-2 badge bg-rose-100 text-rose-700">ineligible</span>}
                          </div>
                          <span className="text-sm font-bold text-brand-700">{s.score}</span>
                        </div>
                      ))}
                  {(isDept ? deptRows.length : top.length) === 0 && <p className="py-3 text-sm text-ink-muted">No scores yet — the arena awaits!</p>}
                </div>

                {/* Most improved — celebrate progress, not just podiums */}
                {!isDept && improved.length > 0 && improved[0].delta > 0 && (
                  <div className="mt-4 rounded-lg bg-gradient-to-r from-green-50 to-white p-3">
                    <div className="mb-1 text-xs font-bold uppercase text-green-700">📈 Most Improved</div>
                    <div className="flex flex-wrap gap-2">
                      {improved.filter((m) => m.delta > 0).slice(0, 3).map((m) => (
                        <span key={m.userId} className="badge bg-white text-ink shadow-sm">{m.name}: +{m.delta}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Hall of results */}
      {completed.length > 0 && (
        <Card className="mt-6">
          <SectionTitle>🏛️ Recent Champions</SectionTitle>
          <div className="space-y-2">
            {completed.map((c) => (
              <div key={c.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="font-semibold text-ink">{c.title}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {c.results.sort((a, b) => a.rank - b.rank).map((r) => (
                    <span key={r.id} className="badge bg-white shadow-sm">
                      {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉"} {r.winnerUserId ? names.get(r.winnerUserId) : r.winnerDepartmentId ? deptNames.get(r.winnerDepartmentId) : "—"} · {r.finalScore} pts · +{r.diamondsAwarded} 💎
                    </span>
                  ))}
                  {c.results.length === 0 && <span className="text-ink-muted">No qualifying winners.</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
