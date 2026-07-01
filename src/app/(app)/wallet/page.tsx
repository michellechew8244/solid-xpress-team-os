import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { currentPeriod, growthLevelName } from "@/lib/enums";
import { dateTime } from "@/lib/format";
import { Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const period = currentPeriod();
  const { source } = await searchParams;
  const onboardingOnly = source === "NEW_ONBOARDING";

  const [txns, monthEarned, ownerBonus] = await Promise.all([
    prisma.pointsTransaction.findMany({
      where: { userId: user.id, ...(onboardingOnly ? { sourceType: "NEW_ONBOARDING" } : {}) },
      orderBy: { createdAt: "desc" }, take: 50,
    }),
    prisma.pointsTransaction.aggregate({ where: { userId: user.id, period, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.pointsTransaction.aggregate({ where: { userId: user.id, transactionType: "OWNER_GENERATE", amount: { gt: 0 } }, _sum: { amount: true } }),
  ]);

  return (
    <>
      <PageHeader title="Diamond Wallet" subtitle={`Level ${user.officialLevel} · ${growthLevelName(user.officialLevel)}`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Diamond Balance" value={user.currentPoints.toLocaleString()} icon="💎" />
        <StatCard label="Earned This Month" value={(monthEarned._sum.amount ?? 0).toLocaleString()} icon="📅" rag="ok" />
        <StatCard label="Diamond Earned" value={user.lifetimePoints.toLocaleString()} icon="🏆" rag="neutral" />
        <StatCard label="Diamond Deducted" value={user.deductedPoints.toLocaleString()} icon="⚠️" rag={user.deductedPoints ? "warn" : "ok"} />
        <StatCard label="Diamond Redeemed" value={user.redeemedPoints.toLocaleString()} icon="🎁" rag="neutral" />
        <StatCard label="Owner Bonus" value={(ownerBonus._sum.amount ?? 0).toLocaleString()} icon="💠" rag="neutral" />
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        Diamonds are earned through performance, contribution, teamwork and recognition.
        Owner-generated diamonds are special rewards issued by management.
      </p>

      <Card className="mt-6 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-2">
          <SectionTitle>Transaction History</SectionTitle>
          <div className="flex gap-1 text-xs">
            <a href="/wallet" className={`badge ${!onboardingOnly ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"}`}>All</a>
            <a href="/wallet?source=NEW_ONBOARDING" className={`badge ${onboardingOnly ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"}`}>New Onboarding</a>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {txns.length === 0 && <p className="p-5 text-sm text-ink-muted">{onboardingOnly ? "No onboarding bonus recorded." : "No transactions yet."}</p>}
          {txns.map((t) => {
            const isOnboarding = t.sourceType === "NEW_ONBOARDING";
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{isOnboarding ? "🎉 " : ""}{t.reason}</div>
                  <div className="text-xs text-ink-muted">{dateTime(t.createdAt)} · {isOnboarding ? "New Onboarding" : t.type}</div>
                </div>
                <span className={`text-sm font-bold ${t.amount >= 0 ? "text-ok" : "text-danger"}`}>
                  {t.amount >= 0 ? "+" : ""}{t.amount}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
