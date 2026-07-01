import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { currentPeriod } from "@/lib/enums";
import { Avatar, Card, PageHeader, SectionTitle } from "@/components/ui";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;
  const period = currentPeriod();

  // Monthly points per user (section Q9 — leaderboard refreshes by month).
  const monthly = await prisma.pointsTransaction.groupBy({
    by: ["userId"],
    where: { period, amount: { gt: 0 } },
    _sum: { amount: true },
  });
  const monthlyMap = new Map(monthly.map((m) => [m.userId, m._sum.amount ?? 0]));

  const users = await prisma.user.findMany({
    where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true, ...(sp.dept ? { departmentId: sp.dept } : {}) },
    include: { department: true },
  });

  const ranked = users
    .map((u) => ({ ...u, monthlyPoints: monthlyMap.get(u.id) ?? 0 }))
    .sort((a, b) => b.monthlyPoints - a.monthlyPoints);

  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
  const champion = ranked[0];

  return (
    <>
      <PageHeader title="Leaderboard" subtitle={`Monthly ranking · ${period}`} />

      {/* Podium */}
      {ranked.length >= 3 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[ranked[1], ranked[0], ranked[2]].map((u, idx) => {
            const place = idx === 1 ? 1 : idx === 0 ? 2 : 3;
            const h = place === 1 ? "h-32" : "h-24";
            return (
              <div key={u.id} className="flex flex-col items-center justify-end">
                <Avatar name={u.name} color={u.avatarColor} size={place === 1 ? 56 : 44} />
                <div className="mt-1 text-center text-sm font-semibold">{u.name.split(" ")[0]}</div>
                <div className="text-xs text-ink-muted">{u.monthlyPoints} pts</div>
                <div className={`mt-1 flex ${h} w-full items-start justify-center rounded-t-lg ${place === 1 ? "bg-amber-400" : place === 2 ? "bg-slate-300" : "bg-orange-300"} pt-2 text-2xl font-bold text-white`}>
                  {place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip label="All departments" href="/leaderboard" active={!sp.dept} />
        {departments.map((d) => <Chip key={d.id} label={d.name} href={`/leaderboard?dept=${d.id}`} active={sp.dept === d.id} />)}
      </div>

      <Card className="p-0">
        <div className="divide-y divide-slate-100">
          {ranked.map((u, i) => (
            <div key={u.id} className={`flex items-center gap-3 px-4 py-2.5 ${u.id === user.id ? "bg-brand-50" : ""}`}>
              <span className={`w-6 text-center text-sm font-bold ${i < 3 ? "text-amber-500" : "text-ink-muted"}`}>{i + 1}</span>
              <Avatar name={u.name} color={u.avatarColor} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{u.name}{u.id === user.id && <span className="ml-1 text-xs text-brand-600">(you)</span>}</div>
                <div className="truncate text-xs text-ink-muted">{u.department?.name} · Lv.{u.officialLevel}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-brand-700">{u.monthlyPoints}</div>
                <div className="text-[10px] text-ink-muted">this month</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {champion && (
        <Card className="mt-6">
          <SectionTitle>Awards (this month)</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Award icon="👑" title="Monthly Champion" name={champion.name} />
            <Award icon="📈" title="Most Improved" name={ranked[Math.min(2, ranked.length - 1)]?.name ?? "—"} />
            <Award icon="🤝" title="Best Teamwork" name={ranked[Math.min(1, ranked.length - 1)]?.name ?? "—"} />
          </div>
        </Card>
      )}
    </>
  );
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <a href={href} className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-ink-soft hover:bg-slate-50"}`}>{label}</a>
  );
}
function Award({ icon, title, name }: { icon: string; title: string; name: string }) {
  return (
    <div className="rounded-lg bg-gradient-to-br from-brand-50 to-white p-4 text-center">
      <div className="text-3xl">{icon}</div>
      <div className="mt-1 text-xs font-semibold uppercase text-ink-muted">{title}</div>
      <div className="text-sm font-bold text-ink">{name}</div>
    </div>
  );
}
