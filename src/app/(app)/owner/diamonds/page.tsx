import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { Avatar, Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { DIAMOND_SOURCE_TYPES } from "@/lib/diamonds";
import { GenerateDiamondForm } from "@/components/diamonds/GenerateDiamondForm";
import { AdjustDiamondForm } from "@/components/diamonds/AdjustDiamondForm";
import { MysteryBonusForm } from "@/components/diamonds/MysteryBonusForm";

export default async function DiamondControlCentre() {
  const user = await getCurrentUser();
  if (!user) return null;
  const canGenerate = isBoss(user.role) || user.hasOwnerDiamondAuthority;
  if (!canGenerate) redirect("/dashboard");
  const period = currentPeriod();

  const [generatedAll, issuedMonth, deductedMonth, redeemedMonth, activeBalance, topEarners, pendingRequests, staff, departments] = await Promise.all([
    prisma.pointsTransaction.aggregate({ where: { transactionType: "OWNER_GENERATE", amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.pointsTransaction.aggregate({ where: { period, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.pointsTransaction.aggregate({ where: { period, amount: { lt: 0 }, type: { not: "REDEMPTION" } }, _sum: { amount: true } }),
    prisma.pointsTransaction.aggregate({ where: { period, type: "REDEMPTION" }, _sum: { amount: true } }),
    prisma.user.aggregate({ where: { isActive: true }, _sum: { currentPoints: true } }),
    prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true }, orderBy: { lifetimePoints: "desc" }, take: 5, select: { id: true, name: true, avatarColor: true, lifetimePoints: true } }),
    prisma.diamondRequest.count({ where: { status: "PENDING_OWNER_APPROVAL" } }),
    prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const n = (v: number | null | undefined) => (v ?? 0).toLocaleString();
  const activeTotal = activeBalance._sum.currentPoints ?? 0;

  return (
    <>
      <PageHeader
        title="Diamond Control Centre"
        subtitle="Owner authority to generate, adjust, approve and monitor all diamonds."
        action={<div className="flex gap-2"><Link href="/diamonds/requests" className="btn-ghost">Requests</Link><Link href="/diamonds/transactions" className="btn-ghost">Transactions</Link></div>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Diamonds Generated" value={n(generatedAll._sum.amount)} icon="💎" />
        <StatCard label="Issued This Month" value={n(issuedMonth._sum.amount)} icon="📈" rag="ok" />
        <StatCard label="Deducted This Month" value={n(Math.abs(deductedMonth._sum.amount ?? 0))} icon="⚠️" rag="warn" />
        <StatCard label="Redeemed This Month" value={n(Math.abs(redeemedMonth._sum.amount ?? 0))} icon="🎁" rag="neutral" />
        <StatCard label="Active Diamond Balance" value={n(activeTotal)} icon="🏦" rag="neutral" />
        <StatCard label="Pending Requests" value={n(pendingRequests)} icon="📥" rag={pendingRequests ? "warn" : "ok"} />
        <StatCard label="Outstanding Liability" value={`${n(activeTotal)} 💎`} icon="📊" rag="neutral" />
        <Card>
          <div className="text-xs uppercase text-ink-muted">Top Diamond Earners</div>
          <div className="mt-2 space-y-1">
            {topEarners.map((u, i) => (
              <div key={u.id} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-center text-xs font-bold text-amber-500">{i + 1}</span>
                <Avatar name={u.name} color={u.avatarColor} size={20} />
                <span className="flex-1 truncate">{u.name}</span>
                <span className="font-semibold text-brand-700">{n(u.lifetimePoints)}</span>
              </div>
            ))}
            {topEarners.length === 0 && <div className="text-sm text-ink-muted">No data yet.</div>}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <SectionTitle>💎 Generate Diamonds</SectionTitle>
        <GenerateDiamondForm staff={staff} departments={departments} sourceTypes={DIAMOND_SOURCE_TYPES} />
      </Card>

      <Card className="mt-6">
        <SectionTitle>🎁 Mystery Bonus</SectionTitle>
        <p className="mb-3 -mt-1 text-xs text-ink-muted">Owner-only surprise rewards — random staff, a department, everyone, or one person who deserved it today.</p>
        <MysteryBonusForm staff={staff} departments={departments} />
      </Card>

      <Card className="mt-6">
        <SectionTitle>Adjust Diamond Balance</SectionTitle>
        <p className="mb-3 -mt-1 text-xs text-ink-muted">Add or deduct diamonds with a mandatory reason. Balances before/after are recorded; nothing is ever deleted.</p>
        <AdjustDiamondForm staff={staff} />
      </Card>
    </>
  );
}
