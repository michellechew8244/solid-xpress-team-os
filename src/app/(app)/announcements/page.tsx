import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { NewAnnouncementForm, AnnouncementRowActions, MarkReadButton } from "@/components/AnnouncementControls";

export default async function AnnouncementsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const canPost = isBoss(user.role) || user.role === "HR_ADMIN";

  const [announcements, myReads, departments, authors] = await Promise.all([
    prisma.announcement.findMany({
      where: { OR: [{ audience: "ALL" }, { audience: user.departmentId ?? "" }] },
      include: { _count: { select: { reads: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.announcementRead.findMany({ where: { userId: user.id }, select: { announcementId: true } }),
    canPost ? prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const readSet = new Set(myReads.map((r) => r.announcementId));
  const nameOf = new Map(authors.map((a) => [a.id, a.name]));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="Company news and updates"
        action={canPost ? <NewAnnouncementForm departments={departments} /> : undefined}
      />

      {announcements.length === 0 ? (
        <EmptyState title="No announcements yet" hint={canPost ? "Post the first one!" : "Check back soon."} />
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const read = readSet.has(a.id);
            return (
              <Card key={a.id} className={a.pinned ? "border-l-4 border-l-brand-500" : ""}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.pinned && <span className="text-sm">📌</span>}
                      <h2 className="font-bold text-ink">{a.title}</h2>
                      {!read && <span className="badge bg-brand-100 text-brand-700">New</span>}
                      {a.audience !== "ALL" && <span className="badge bg-slate-100 text-slate-600">{deptName.get(a.audience) ?? "Department"}</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{a.body}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      {nameOf.get(a.createdById) ?? "—"} · {dateTime(a.createdAt)}
                      {canPost && ` · read by ${a._count.reads}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!read && <MarkReadButton id={a.id} />}
                    {canPost && <AnnouncementRowActions id={a.id} pinned={a.pinned} canDelete={isBoss(user.role)} />}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
