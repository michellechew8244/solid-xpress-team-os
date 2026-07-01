import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss, canApproveTasks } from "@/lib/rbac";
import { sweepOverdue } from "@/services/tasks";
import { isOverdue, shortDate } from "@/lib/format";
import { TASK_STATUS_LABELS } from "@/lib/enums";
import type { Prisma } from "@prisma/client";
import { Avatar, Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { NewTaskForm } from "@/components/NewTaskForm";

export default async function MissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  await sweepOverdue();
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;

  // Role scoping (section A / Q8).
  const where: Prisma.TaskWhereInput = {};
  if (isBoss(user.role)) {
    // all
  } else if (user.role === "DEPARTMENT_HEAD") {
    where.departmentId = user.departmentId;
  } else {
    where.assigneeId = user.id;
  }
  if (sp.status) where.status = sp.status;
  if (sp.priority) where.priority = sp.priority;

  const tasks = await prisma.task.findMany({
    where,
    include: { assignee: true, department: true, job: true },
    orderBy: [{ status: "asc" }, { deadline: "asc" }],
  });

  // People list for the create form (managers assign within visibility).
  const people = canApproveTasks(user.role)
    ? await prisma.user.findMany({
        where: isBoss(user.role) ? { isActive: true } : { departmentId: user.departmentId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const statuses = ["NOT_STARTED", "IN_PROGRESS", "WAITING_EXTERNAL", "COMPLETED", "REJECTED", "OVERDUE"];
  const counts = Object.fromEntries(statuses.map((s) => [s, tasks.filter((t) => (s === "OVERDUE" ? t.status === "OVERDUE" : t.status === s)).length]));

  return (
    <>
      <PageHeader
        title="Mission Board"
        subtitle="Every task has an owner, deadline, status, proof and result."
        action={<NewTaskForm people={people} selfOnly={!canApproveTasks(user.role)} />}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip label="All" href="/missions" active={!sp.status} />
        {statuses.map((s) => (
          <FilterChip key={s} label={`${TASK_STATUS_LABELS[s]} (${counts[s] ?? 0})`} href={`/missions?status=${s}`} active={sp.status === s} />
        ))}
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No missions found" hint="Try clearing filters or create a new mission." />
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const od = t.status === "OVERDUE" || isOverdue(t.deadline, t.status);
              return (
                <Link key={t.id} href={`/missions/${t.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${od ? "bg-rose-50/40" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{t.title}</span>
                      {od && <span className="badge bg-red-100 text-red-700">overdue</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-muted">
                      {t.department?.name ?? "—"} · {t.type.replace(/_/g, " ")}{t.job ? ` · ${t.job.jobNumber}` : ""} · due {shortDate(t.deadline)}
                    </div>
                  </div>
                  {t.assignee && <Avatar name={t.assignee.name} color={t.assignee.avatarColor} size={28} />}
                  <Pill value={t.priority} />
                  <Pill value={od ? "OVERDUE" : t.status} label={TASK_STATUS_LABELS[od ? "OVERDUE" : t.status]} />
                  <span className="hidden w-14 text-right text-xs font-semibold text-brand-700 sm:block">{t.pointsValue} pts</span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link href={href} className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-brand-600 text-white" : "bg-white text-ink-soft border border-slate-200 hover:bg-slate-50"}`}>
      {label}
    </Link>
  );
}
