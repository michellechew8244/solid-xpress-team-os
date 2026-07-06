import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { requireFeature } from "@/lib/features";
import { todaysBirthdayIds } from "@/lib/birthday";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui";
import { ForumComposer, DeleteMessageButton } from "@/components/ForumControls";

export default async function ForumPage() {
  await requireFeature("forum");
  const user = await getCurrentUser();
  if (!user) return null;

  // Newest last so the newest message sits just above the composer (chat style).
  const [messages, bdayIds, people] = await Promise.all([
    prisma.forumMessage.findMany({
      include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    todaysBirthdayIds(),
    prisma.user.findMany({
      where: { isActive: true, NOT: { email: { endsWith: "@solidxpress.system" } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  messages.reverse();

  // Highlight @mentions of real staff names inside message bodies.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameAlt = people.map((p) => esc(p.name)).sort((a, b) => b.length - a.length).join("|");
  const mentionRe = nameAlt ? new RegExp(`@(${nameAlt})`, "gi") : null;
  const renderBody = (body: string, mine: boolean) => {
    if (!mentionRe || !body.includes("@")) return body;
    const parts = body.split(mentionRe);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <span key={i} className={`rounded px-1 font-semibold ${mine ? "bg-white/20" : "bg-brand-100 text-brand-700"}`}>@{part}</span>
        : part,
    );
  };

  return (
    <>
      <PageHeader title="💬 Staff Forum" subtitle="One team, one conversation. Chat with everyone at Solid Xpress." />

      <Card className="p-0">
        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <EmptyState title="No messages yet" hint="Say hi to the team 👋" />
          ) : (
            messages.map((m) => {
              const mine = m.user.id === user.id;
              return (
                <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                  {m.user.avatarUrl
                    ? <img src={m.user.avatarUrl} alt={m.user.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    : <Avatar name={m.user.name} color={m.user.avatarColor} size={32} />}
                  <div className={`max-w-[78%] ${mine ? "text-right" : ""}`}>
                    <div className="text-[11px] text-ink-muted">{bdayIds.has(m.user.id) ? "🎂 " : ""}{mine ? "You" : m.user.name}{bdayIds.has(m.user.id) ? " (Birthday!)" : ""} · {dateTime(m.createdAt)}</div>
                    <div className={`mt-0.5 inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${mine ? "bg-brand-600 text-white" : "bg-slate-100 text-ink"}`}>
                      {renderBody(m.body, mine)}
                    </div>
                    {(mine || isBoss(user.role)) && <div className="mt-0.5"><DeleteMessageButton id={m.id} /></div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-slate-100 p-4">
          <ForumComposer people={people.filter((p) => p.id !== user.id)} />
        </div>
      </Card>
    </>
  );
}
