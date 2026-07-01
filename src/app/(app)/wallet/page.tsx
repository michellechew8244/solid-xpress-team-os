import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { currentPeriod, growthLevelName } from "@/lib/enums";
import { dateTime } from "@/lib/format";
import { Card, PageHeader, Pill, SectionTitle, StatCard } from "@/components/ui";

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const period = currentPeriod();

  const [txns, monthEarned] = await Promise.all([
    prisma.pointsTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.pointsTransaction.aggregate({ where: { userId: user.id, period, amount: { gt: 0 } }, _sum: { amount: true } }),
  ]);

  return (
    <>
      <PageHeader title="Points Wallet" subtitle={`Level ${user.officialLevel} · ${growthLevelName(user.officialLevel)}`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Available Balance" value={user.currentPoints.toLocaleString()} icon="💎" />
        <StatCard label="Earned This Month" value={(monthEarned._sum.amount ?? 0).toLocaleString()} icon="📅" rag="ok" />
        <StatCard label="Lifetime Points" value={user.lifetimePoints.toLocaleString()} icon="🏆" rag="neutral" />
        <StatCard label="Points Deducted" value={user.deductedPoints.toLocaleString()} icon="⚠️" rag={user.deductedPoints ? "warn" : "ok"} />
        <StatCard label="Redeemed" value={user.redeemedPoints.toLocaleString()} icon="🎁" rag="neutral" />
        <StatCard label="Growth Level" value={`Lv.${user.officialLevel}`} sub={growthLevelName(user.officialLevel)} icon="🚀" rag="neutral" />
      </div>

      <Card className="mt-6 p-0">
        <div className="p-5 pb-2"><SectionTitle>Transaction History</SectionTitle></div>
        <div className="divide-y divide-slate-100">
          {txns.length === 0 && <p className="p-5 text-sm text-ink-muted">No transactions yet.</p>}
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{t.reason}</div>
                <div className="text-xs text-ink-muted">{dateTime(t.createdAt)} · {t.type}</div>
              </div>
              <span className={`text-sm font-bold ${t.amount >= 0 ? "text-ok" : "text-danger"}`}>
                {t.amount >= 0 ? "+" : ""}{t.amount}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
