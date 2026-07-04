import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canManageRewards } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { leaveBlockReason } from "@/services/leave";
import { Avatar, Card, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { RedeemButton, RedemptionDecision } from "@/components/RewardButtons";
import { AddRewardPanel, RewardCardControls } from "@/components/RewardAdmin";
import { requireFeature } from "@/lib/features";

export default async function RewardsPage() {
  await requireFeature("rewards");
  const user = await getCurrentUser();
  if (!user) return null;
  const isDeptHead = user.role === "DEPARTMENT_HEAD";
  const canManage = canManageRewards(user.role);
  const isApprover = canManage || isDeptHead;
  const leaveBlock = await leaveBlockReason(user.id);

  const [rewards, myRedemptions, pendingQueue] = await Promise.all([
    // Managers see everything (incl. hidden/inactive items to edit); staff see only active.
    prisma.reward.findMany({ where: canManage ? {} : { isActive: true }, orderBy: [{ isActive: "desc" }, { pointsCost: "asc" }] }),
    prisma.rewardRedemption.findMany({ where: { userId: user.id }, include: { reward: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    isApprover
      ? prisma.rewardRedemption.findMany({
          // Dept heads only see their own department's queue.
          where: { status: "PENDING", ...(isDeptHead && !canManageRewards(user.role) ? { user: { departmentId: user.departmentId } } : {}) },
          include: { reward: true, user: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Reward Store" subtitle={`Your balance: ${user.currentPoints.toLocaleString()} Diamonds 💎`} />

      {canManage && (
        <Card className="mb-6">
          <SectionTitle>Manage Reward Store</SectionTitle>
          <p className="mb-3 text-xs text-ink-muted">Add, edit or remove rewards. Inactive items are hidden from staff but shown here so you can re-enable them.</p>
          <AddRewardPanel />
        </Card>
      )}

      {isApprover && pendingQueue.length > 0 && (
        <Card className="mb-6 border-l-4 border-l-warn">
          <SectionTitle>Pending Approvals ({pendingQueue.length})</SectionTitle>
          <div className="divide-y divide-slate-100">
            {pendingQueue.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Avatar name={r.user.name} color={r.user.avatarColor} size={28} />
                  <div>
                    <div className="text-sm font-semibold">{r.user.name}</div>
                    <div className="text-xs text-ink-muted">{r.reward.imageEmoji} {r.reward.name} · {r.pointsSpent} Diamonds</div>
                  </div>
                </div>
                <RedemptionDecision id={r.id} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rewards.map((r) => (
          <Card key={r.id} className={`flex flex-col ${!r.isActive ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="text-4xl">{r.imageEmoji}</div>
              {!r.isActive && <Pill value="WARN" label="Hidden" />}
            </div>
            <div className="mt-2 font-bold text-ink">{r.name}</div>
            <div className="text-xs text-ink-muted">{r.description}</div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs">
              <Pill value="OK" label={r.category.replace(/_/g, " ")} />
              {r.stock >= 0 && <Pill value={r.stock === 0 ? "DANGER" : "NEUTRAL"} label={r.stock === 0 ? "Out of stock" : `${r.stock} left`} />}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-lg font-bold text-brand-700">{r.pointsCost.toLocaleString()} <span className="text-xs font-normal text-ink-muted">Diamonds</span></span>
            </div>
            {r.isActive && (
              <div className="mt-2">
                <RedeemButton rewardId={r.id} cost={r.pointsCost} balance={user.currentPoints} blockedReason={r.category === "EXTRA_LEAVE" ? leaveBlock : null} />
              </div>
            )}
            {canManage && (
              <RewardCardControls reward={{ id: r.id, name: r.name, description: r.description, category: r.category, pointsCost: r.pointsCost, stock: r.stock, imageEmoji: r.imageEmoji, isActive: r.isActive }} />
            )}
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <SectionTitle>My Redemptions</SectionTitle>
        <div className="divide-y divide-slate-100">
          {myRedemptions.length === 0 && <p className="text-sm text-ink-muted">No redemptions yet.</p>}
          {myRedemptions.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>{r.reward.imageEmoji} {r.reward.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-ink-muted">{dateTime(r.createdAt)}</span>
                <Pill value={r.status === "APPROVED" ? "COMPLETED" : r.status === "REJECTED" ? "REJECTED" : "WAITING_EXTERNAL"} label={r.status} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
