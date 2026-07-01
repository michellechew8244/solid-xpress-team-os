import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { Card, EmptyState, PageHeader } from "@/components/ui";

async function markAllRead() {
  "use server";
  const session = await getSession();
  if (!session) return;
  await prisma.notification.updateMany({ where: { userId: session.id, read: false }, data: { read: true } });
  revalidatePath("/notifications");
}

const ICON: Record<string, string> = {
  TASK_ASSIGNED: "🎯", TASK_APPROVED: "✅", TASK_REJECTED: "↩️", POINTS_AWARDED: "💎", POINTS_DEDUCTED: "⚠️",
  REWARD_APPROVED: "🎁", REWARD_REJECTED: "🚫", COACHING_ASSIGNED: "🎓", CUSTOMER_COMPLAINT: "📣", BADGE_EARNED: "🏅",
};

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) return null;
  const items = await prisma.notification.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <>
      <PageHeader
        title="Notifications"
        action={<form action={markAllRead}><button className="btn-ghost">Mark all read</button></form>}
      />
      {items.length === 0 ? (
        <EmptyState title="No notifications" />
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-slate-100">
            {items.map((n) => {
              const inner = (
                <div className={`flex items-start gap-3 px-4 py-3 ${n.read ? "" : "bg-brand-50/50"}`}>
                  <span className="text-xl">{ICON[n.type] ?? "🔔"}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink">{n.title}</div>
                    {n.body && <div className="text-xs text-ink-soft">{n.body}</div>}
                    <div className="text-[11px] text-ink-muted">{dateTime(n.createdAt)}</div>
                  </div>
                  {!n.read && <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" />}
                </div>
              );
              return n.link ? <Link key={n.id} href={n.link} className="block hover:bg-slate-50">{inner}</Link> : <div key={n.id}>{inner}</div>;
            })}
          </div>
        </Card>
      )}
    </>
  );
}
