import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { Avatar, Card, EmptyState, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { NewWishForm, BossWishDecision, BossWishOutcome, SubmitProofForm } from "@/components/WishingTreeControls";

const STATUS: Record<string, { pill: string; label: string }> = {
  PENDING: { pill: "WARN", label: "Awaiting Boss approval" },
  APPROVED: { pill: "OK", label: "Challenge in progress" },
  REJECTED: { pill: "DANGER", label: "Rejected" },
  PROOF_SUBMITTED: { pill: "WARN", label: "Proof under review" },
  GRANTED: { pill: "OK", label: "🎉 Wish granted" },
  FAILED: { pill: "DANGER", label: "Challenge not passed" },
};

export default async function WishingTreePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const boss = isBoss(user.role);

  const wishes = await prisma.wish.findMany({
    include: { user: { select: { name: true, avatarColor: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  // Staff see their own + all granted wishes (inspiration); Boss sees everything.
  const visible = boss ? wishes : wishes.filter((w) => w.userId === user.id || w.status === "GRANTED");
  const granted = wishes.filter((w) => w.status === "GRANTED");
  const pendingCount = wishes.filter((w) => w.status === "PENDING").length;
  const reviewCount = wishes.filter((w) => w.status === "PROOF_SUBMITTED").length;

  return (
    <>
      <PageHeader
        title="🌳 Wishing Tree"
        subtitle="Make a wish, take on a Mission Impossible challenge, and earn your dream."
        action={<NewWishForm />}
      />

      {boss && (pendingCount > 0 || reviewCount > 0) && (
        <Card className="mb-6 border-l-4 border-l-warn">
          <p className="text-sm text-ink">
            🧭 <strong>{pendingCount}</strong> wish{pendingCount === 1 ? "" : "es"} awaiting your approval ·{" "}
            <strong>{reviewCount}</strong> challenge proof{reviewCount === 1 ? "" : "s"} to review.
          </p>
        </Card>
      )}

      {/* Granted wishes ribbon */}
      {granted.length > 0 && (
        <Card className="mb-6 bg-gradient-to-br from-brand-50 to-white">
          <SectionTitle>✨ Dreams Come True</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {granted.slice(0, 12).map((w) => (
              <span key={w.id} className="badge bg-white text-ink shadow-sm">{w.emoji} {w.user.name.split(" ")[0]}: {w.title}</span>
            ))}
          </div>
        </Card>
      )}

      {visible.length === 0 ? (
        <EmptyState title="The tree is bare 🌱" hint="Be the first to make a wish and plant it on the tree!" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((w) => {
            const st = STATUS[w.status] ?? STATUS.PENDING;
            const mine = w.userId === user.id;
            return (
              <Card key={w.id} className={w.status === "GRANTED" ? "border-l-4 border-l-ok" : w.status === "APPROVED" ? "border-l-4 border-l-brand-400" : ""}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-3xl">{w.emoji}</div>
                  <Pill value={st.pill} label={st.label} />
                </div>
                <div className="mt-1 font-bold text-ink">{w.title}</div>
                {w.description && <p className="text-xs text-ink-soft">{w.description}</p>}
                <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs">
                  <span className="font-semibold text-ink">🎯 Challenge:</span> <span className="text-ink-soft">{w.challenge}</span>
                </div>
                {w.stakeAmount > 0 && (
                  <div className="mt-1 text-xs font-semibold">
                    {w.status === "GRANTED" ? (
                      <span className="text-ok">💎 Stake won: +{w.stakeAmount * 2} (doubled!)</span>
                    ) : w.status === "FAILED" ? (
                      <span className="text-danger">💎 Stake forfeited: -{w.stakeAmount}</span>
                    ) : w.status === "REJECTED" ? (
                      <span className="text-ink-muted">💎 Stake refunded: {w.stakeAmount}</span>
                    ) : (
                      <span className="text-amber-600">💎 {w.stakeAmount} staked — win it back doubled!</span>
                    )}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                  <Avatar name={w.user.name} color={w.user.avatarColor} size={18} /> {w.user.name} · {dateTime(w.createdAt)}
                </div>
                {w.decisionNote && <p className="mt-1 text-xs italic text-ink-muted">“{w.decisionNote}”</p>}
                {w.evidenceUrl && <a href={w.evidenceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand-600 hover:underline">📷 view challenge proof</a>}

                {/* Actions */}
                <div className="mt-3">
                  {boss && w.status === "PENDING" && <BossWishDecision wishId={w.id} />}
                  {boss && w.status === "PROOF_SUBMITTED" && <BossWishOutcome wishId={w.id} />}
                  {mine && (w.status === "APPROVED" || w.status === "PROOF_SUBMITTED") && <SubmitProofForm wishId={w.id} />}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
