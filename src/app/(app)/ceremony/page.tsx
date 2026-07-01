import { getCurrentUser } from "@/lib/auth";
import { getCeremony } from "@/services/ceremony";
import { GRADE_LABEL } from "@/lib/enums";
import { Avatar, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";

/** Monthly Recognition Ceremony view (spec §10) — public to all staff. */
export default async function CeremonyPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const c = await getCeremony();

  return (
    <>
      <PageHeader title="🎤 Monthly Recognition Ceremony" subtitle={`Celebrating ${c.period} — every department protects the company in a different way`} />

      {/* Headline champion */}
      {c.companyChampion ? (
        <Card className="mb-6 bg-gradient-to-br from-amber-50 to-white">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <div className="text-4xl">👑</div>
            <div className="text-xs font-bold uppercase tracking-wide text-amber-600">Company Champion</div>
            <Avatar name={c.companyChampion.name} color={c.companyChampion.avatarColor} size={64} />
            <div className="text-xl font-bold text-ink">{c.companyChampion.name}</div>
            <div className="text-sm text-ink-muted">{c.companyChampion.department?.name} · {c.companyChampion.monthlyEarned.toLocaleString()} points this month</div>
          </div>
        </Card>
      ) : (
        <EmptyState title="No data for this month yet" hint="Award points and generate reviews to populate the ceremony." />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Award icon="🦸" title="Customer Hero" name={c.customerHero?.user.name} sub={c.customerHero ? `${c.customerHero.value} compliment pts` : undefined} color={c.customerHero?.user.avatarColor} />
        <Award icon="🤝" title="Best Team Player" name={c.teamPlayer?.user.name} sub={c.teamPlayer ? `${c.teamPlayer.value} teamwork pts` : undefined} color={c.teamPlayer?.user.avatarColor} />
        <Award icon="🧩" title="Best Problem Solver" name={c.problemSolver?.user.name} sub={c.problemSolver ? `${c.problemSolver.value} pts` : undefined} color={c.problemSolver?.user.avatarColor} />
        <Award icon="📈" title="Most Improved" name={c.mostImproved?.name} sub={c.mostImproved ? `${c.mostImproved.monthlyEarned} pts this month` : undefined} color={c.mostImproved?.avatarColor} />
        <Award icon="🏅" title="Top Grade" name={c.bestGraded?.staff.name} sub={c.bestGraded ? `Grade ${GRADE_LABEL[c.bestGraded.finalGrade ?? "C"]} · ${Math.round(c.bestGraded.totalScore)}` : undefined} color={c.bestGraded?.staff.avatarColor} />
      </div>

      {/* Department champions */}
      <Card className="mt-6">
        <SectionTitle>🏢 Department Champions</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {c.deptChampions.map((d) => (
            <div key={d.department} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              <Avatar name={d.user.name} color={d.user.avatarColor} size={36} />
              <div>
                <div className="text-xs text-ink-muted">{d.department}</div>
                <div className="text-sm font-semibold text-ink">{d.user.name}</div>
                <div className="text-xs text-brand-700">{d.user.monthlyEarned} pts</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>🎯 Zero Mistake This Month</SectionTitle>
          {c.zeroMistake.length === 0 ? (
            <p className="text-sm text-ink-muted">No zero-mistake staff recorded yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {c.zeroMistake.map((u) => (
                <span key={u.id} className="flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                  <Avatar name={u.name} color={u.avatarColor} size={18} /> {u.name}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>🎰 Lucky Draw Winners</SectionTitle>
          {c.winners.length === 0 ? (
            <p className="text-sm text-ink-muted">No winners drawn yet.</p>
          ) : (
            <div className="space-y-2">
              {c.winners.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {w.winner && <Avatar name={w.winner.name} color={w.winner.avatarColor} size={26} />}
                    <div>
                      <div className="text-sm font-semibold text-ink">{w.winner?.name}</div>
                      <div className="text-xs text-ink-muted">{w.campaign.title}</div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-amber-600">🎁 {w.prizeName}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Ceremony format */}
      <Card className="mt-6">
        <SectionTitle>Suggested 15-Minute Monthly Huddle</SectionTitle>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>Show the company leaderboard and department ranking.</li>
          <li>Announce the champions and badges earned.</li>
          <li>Show reward redemptions of the month.</li>
          <li>Run the lucky draw and announce winners.</li>
          <li>Boss gives a short recognition speech.</li>
        </ol>
        <p className="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
          “Every department can become champion because every department protects the company in a different way.”
        </p>
      </Card>
    </>
  );
}

function Award({ icon, title, name, sub, color }: { icon: string; title: string; name?: string; sub?: string; color?: string }) {
  return (
    <Card className="text-center">
      <div className="text-3xl">{icon}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{title}</div>
      {name ? (
        <>
          <div className="mt-2 flex justify-center"><Avatar name={name} color={color} size={40} /></div>
          <div className="mt-1 text-sm font-bold text-ink">{name}</div>
          {sub && <div className="text-xs text-ink-muted">{sub}</div>}
        </>
      ) : (
        <div className="mt-2 text-sm text-ink-muted">—</div>
      )}
    </Card>
  );
}
