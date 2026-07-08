import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { Avatar, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { requireFeature } from "@/lib/features";
import { WallOfFameAdmin, CATEGORY_META, type FameEntry } from "@/components/WallOfFameAdmin";

interface WallItem {
  key: string;
  icon: string;
  title: string;
  detail: string;
  userName: string;
  avatarColor: string;
  at: Date;
}

export default async function AchievementWallPage() {
  await requireFeature("achievement-wall");
  const user = await getCurrentUser();
  if (!user) return null;

  const canManage = isBoss(user.role) || user.role === "HR_ADMIN";
  const [fameEntries, badges, levels, pkResults, proposals, wishes, specialTxns, users, campaigns, badgeDefs, deptList] = await Promise.all([
    prisma.hallOfFameEntry.findMany({ where: canManage ? {} : { isActive: true }, orderBy: [{ order: "asc" }, { createdAt: "desc" }] }),
    prisma.userBadge.findMany({ orderBy: { awardedAt: "desc" }, take: 15 }),
    prisma.levelHistory.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.pKResult.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.proposal.findMany({ where: { status: { in: ["ACCEPTED", "IMPLEMENTED"] } }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.wish.findMany({ where: { status: "GRANTED" }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.pointsTransaction.findMany({ where: { sourceType: { in: ["PERFECT_ATTENDANCE", "MYSTERY_BONUS"] }, amount: { gt: 0 } }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.user.findMany({ select: { id: true, name: true, avatarColor: true } }),
    prisma.pKCampaign.findMany({ select: { id: true, title: true } }),
    prisma.badge.findMany({ select: { id: true, name: true, icon: true } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
  ]);
  const u = new Map(users.map((x) => [x.id, x]));
  const camp = new Map(campaigns.map((c) => [c.id, c.title]));
  const bd = new Map(badgeDefs.map((b) => [b.id, b]));
  const dept = new Map(deptList.map((d) => [d.id, d.name]));
  const who = (id: string | null | undefined) => u.get(id ?? "") ?? { name: "—", avatarColor: "#1b45d6" };

  const items: WallItem[] = [
    ...badges.map((b): WallItem => {
      const person = who(b.userId); const def = bd.get(b.badgeId);
      return { key: `b-${b.id}`, icon: def?.icon ?? "🏅", title: `${person.name} earned the ${def?.name ?? "badge"} badge`, detail: b.note ?? "Recognition for great work", userName: person.name, avatarColor: person.avatarColor, at: b.awardedAt };
    }),
    ...levels.map((l): WallItem => {
      const person = who(l.userId);
      return { key: `l-${l.id}`, icon: "🚀", title: `${person.name} levelled up to Lv.${l.toLevel}`, detail: l.reason ?? "Growth Roadmap promotion", userName: person.name, avatarColor: person.avatarColor, at: l.createdAt };
    }),
    ...pkResults.map((r): WallItem => {
      const person = r.winnerUserId ? who(r.winnerUserId) : { name: dept.get(r.winnerDepartmentId ?? "") ?? "Team", avatarColor: "#7c3aed" };
      return { key: `p-${r.id}`, icon: r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉", title: `${person.name} placed #${r.rank} in ${camp.get(r.campaignId) ?? "a PK"}`, detail: `Score ${r.finalScore} · +${r.diamondsAwarded} 💎`, userName: person.name, avatarColor: person.avatarColor, at: r.createdAt };
    }),
    ...proposals.map((p): WallItem => {
      const person = who(p.submittedById);
      return { key: `pr-${p.id}`, icon: "💡", title: `${person.name}'s idea was ${p.status === "IMPLEMENTED" ? "implemented" : "accepted"}`, detail: p.title, userName: person.name, avatarColor: person.avatarColor, at: p.implementedAt ?? p.acceptedAt ?? p.updatedAt };
    }),
    ...wishes.map((w): WallItem => {
      const person = who(w.userId);
      return { key: `w-${w.id}`, icon: w.emoji, title: `${person.name}'s wish was granted`, detail: w.title, userName: person.name, avatarColor: person.avatarColor, at: w.decidedAt ?? w.updatedAt };
    }),
    ...specialTxns.map((t): WallItem => {
      const person = who(t.userId);
      const perfect = t.sourceType === "PERFECT_ATTENDANCE";
      return { key: `t-${t.id}`, icon: perfect ? "🗓️" : "🎁", title: perfect ? `${person.name} achieved perfect attendance` : `${person.name} received a Mystery Bonus`, detail: `${t.reason} · +${t.amount} 💎`, userName: person.name, avatarColor: person.avatarColor, at: t.createdAt };
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 40);

  const famePeople = users.map((x) => ({ id: x.id, name: x.name }));

  return (
    <>
      <PageHeader title="🏛️ Achievement Wall" subtitle="Public recognition — every win, level-up and granted dream at Solid Xpress." />

      {/* ⭐ Curated Wall of Fame (Boss/HR editable) */}
      {canManage && <WallOfFameAdmin entries={fameEntries as FameEntry[]} people={famePeople} />}

      {fameEntries.filter((e) => e.isActive).length > 0 && (
        <Card className="mb-6 border-amber-200 bg-gradient-to-b from-amber-50/60 to-white">
          <SectionTitle>⭐ Wall of Fame</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fameEntries.filter((e) => e.isActive).map((e) => {
              const meta = CATEGORY_META(e.category);
              const person = e.userId ? u.get(e.userId) : null;
              return (
                <div key={e.id} className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
                  {e.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.imageUrl} alt={e.title} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-amber-100 to-amber-50 text-6xl">{meta.icon}</div>
                  )}
                  <div className="p-3">
                    <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                      <span>{meta.icon} {meta.label.replace(/^\S+\s/, "")}</span>
                      {e.periodLabel && <span className="text-ink-muted">· {e.periodLabel}</span>}
                    </div>
                    <div className="font-bold text-ink">{e.title}</div>
                    {(person || e.honoree) && (
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
                        {person && <Avatar name={person.name} color={person.avatarColor} size={20} />}
                        <span className="font-semibold">{person?.name ?? e.honoree}</span>
                      </div>
                    )}
                    {e.description && <p className="mt-1 text-xs text-ink-muted">{e.description}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <SectionTitle>📰 Recent recognition feed</SectionTitle>
      {items.length === 0 ? (
        <EmptyState title="The wall awaits its first hero" hint="Badges, PK wins, accepted ideas and granted wishes will appear here." />
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.key} className="flex items-center gap-3 py-3">
              <div className="text-3xl">{it.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{it.title}</div>
                <div className="truncate text-xs text-ink-muted">{it.detail}</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <Avatar name={it.userName} color={it.avatarColor} size={22} />
                <span className="hidden sm:block">{dateTime(it.at)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
