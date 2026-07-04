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
  const [messages, bdayIds] = await Promise.all([
    prisma.forumMessage.findMany({
      include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    todaysBirthdayIds(),
  ]);
  messages.reverse();

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
                      {m.body}
                    </div>
                    {(mine || isBoss(user.role)) && <div className="mt-0.5"><DeleteMessageButton id={m.id} /></div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-slate-100 p-4">
          <ForumComposer />
        </div>
      </Card>
    </>
  );
}
