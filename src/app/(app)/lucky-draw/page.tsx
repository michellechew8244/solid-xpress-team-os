import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { LUCKY_DRAW_SOURCES } from "@/lib/enums";
import { rm, shortDate } from "@/lib/format";
import { Avatar, Card, EmptyState, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { BuyEntryButton, DrawButton, ClaimButton, CreateCampaignForm, TemplatePicker, AddPrizeForm, GrantEntryForm } from "@/components/LuckyDrawControls";
import { requireFeature } from "@/lib/features";

export default async function LuckyDrawPage() {
  await requireFeature("lucky-draw");
  const user = await getCurrentUser();
  if (!user) return null;
  const canManage = isBoss(user.role) || user.role === "HR_ADMIN";

  const campaigns = await prisma.luckyDrawCampaign.findMany({
    include: {
      prizes: { include: { winner: true }, orderBy: { order: "asc" } },
      entries: { include: { user: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const staff = canManage
    ? await prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  return (
    <>
      <PageHeader
        title="Lucky Draw"
        subtitle="Earn entries through performance — win prizes"
        action={canManage ? <div className="flex items-start gap-2"><TemplatePicker /><CreateCampaignForm /></div> : undefined}
      />

      {campaigns.length === 0 ? (
        <EmptyState title="No lucky draw campaigns yet" hint={canManage ? "Create one to get started." : "Check back soon!"} />
      ) : (
        <div className="space-y-6">
          {campaigns.map((c) => {
            const totalEntries = c.entries.reduce((s, e) => s + e.entryCount, 0);
            const myEntries = c.entries.filter((e) => e.userId === user.id).reduce((s, e) => s + e.entryCount, 0);
            const myChance = totalEntries > 0 ? Math.round((myEntries / totalEntries) * 100) : 0;
            // Entry breakdown by source (for the current user).
            const mineBySource = new Map<string, number>();
            for (const e of c.entries.filter((e) => e.userId === user.id)) mineBySource.set(e.sourceType, (mineBySource.get(e.sourceType) ?? 0) + e.entryCount);

            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-ink">🎰 {c.title}</h2>
                      <Pill value={c.status === "ACTIVE" ? "OK" : c.status === "DRAWN" ? "COMPLETED" : "WARN"} label={c.status} />
                      <span className="badge bg-slate-100 text-slate-600">{c.campaignType.replace(/_/g, " ")}</span>
                    </div>
                    {c.description && <p className="text-sm text-ink-muted">{c.description}</p>}
                    {c.entryRule && <p className="mt-1 text-xs text-ink-muted">📋 {c.entryRule}</p>}
                    {c.drawDate && <p className="text-xs text-ink-muted">Draw date: {shortDate(c.drawDate)}</p>}
                  </div>
                  <div className="rounded-lg bg-brand-50 px-4 py-2 text-center">
                    <div className="text-2xl font-bold text-brand-700">{myEntries}</div>
                    <div className="text-xs text-ink-muted">my entries · ~{myChance}% chance</div>
                  </div>
                </div>

                {myEntries > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...mineBySource.entries()].map(([src, n]) => (
                      <span key={src} className="badge bg-slate-100 text-slate-600">{LUCKY_DRAW_SOURCES[src] ?? src}: {n}</span>
                    ))}
                  </div>
                )}

                {c.status === "ACTIVE" && c.pointsPerEntry > 0 && (
                  <div className="mt-3"><BuyEntryButton campaignId={c.id} cost={c.pointsPerEntry} balance={user.currentPoints} /></div>
                )}

                {/* Prizes */}
                <div className="mt-4">
                  <SectionTitle>Prizes ({c.prizes.length})</SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {c.prizes.map((p) => (
                      <div key={p.id} className={`rounded-lg border p-3 ${p.status === "AVAILABLE" ? "border-slate-200" : "border-green-200 bg-green-50"}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">🎁 {p.prizeName}</span>
                          <Pill value={p.status === "AVAILABLE" ? "WARN" : "OK"} label={p.status} />
                        </div>
                        {p.prizeValue > 0 && <div className="text-xs text-ink-muted">Value {rm(p.prizeValue)}</div>}
                        {p.winner && (
                          <div className="mt-2 flex items-center gap-2 text-sm">
                            <Avatar name={p.winner.name} color={p.winner.avatarColor} size={24} />
                            <span className="font-semibold text-ok">{p.winner.name}{p.winnerUserId === user.id ? " (you! 🎉)" : ""}</span>
                          </div>
                        )}
                        {canManage && (
                          <div className="mt-2">
                            {p.status === "AVAILABLE" && <DrawButton prizeId={p.id} />}
                            {p.status === "WON" && <ClaimButton prizeId={p.id} />}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {canManage && <AddPrizeForm campaignId={c.id} />}
                </div>

                {/* Admin: entries + grant */}
                {canManage && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <SectionTitle>All Entries ({totalEntries})</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {[...c.entries.reduce((m, e) => m.set(e.user.name, (m.get(e.user.name) ?? 0) + e.entryCount), new Map<string, number>())].map(([name, n]) => (
                        <span key={name} className="badge bg-slate-100 text-slate-600">{name}: {n}</span>
                      ))}
                    </div>
                    {c.status === "ACTIVE" && <GrantEntryForm campaignId={c.id} staff={staff} />}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
