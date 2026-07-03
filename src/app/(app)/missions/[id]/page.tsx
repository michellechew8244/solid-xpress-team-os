import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canApproveTasks, isBoss } from "@/lib/rbac";
import { dateTime, shortDate, isOverdue } from "@/lib/format";
import { TASK_STATUS_LABELS } from "@/lib/enums";
import { Avatar, Card, Pill, SectionTitle } from "@/components/ui";
import { WorkflowButtons, ChecklistItem, CommentBox } from "@/components/TaskDetailActions";
import { requireFeature } from "@/lib/features";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireFeature("task-board");
  const user = await getCurrentUser();
  if (!user) return null;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: true,
      reviewer: true,
      department: true,
      customer: true,
      job: true,
      checklist: { orderBy: { order: "asc" } },
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) notFound();

  // A reviewer can approve unless it's their own task (and they're not boss).
  const canApprove =
    canApproveTasks(user.role) && (task.assigneeId !== user.id || isBoss(user.role));
  const od = task.status === "OVERDUE" || isOverdue(task.deadline, task.status);

  return (
    <>
      <Link href="/missions" className="text-sm text-brand-600">← Back to Mission Board</Link>
      <div className="mt-3 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-ink">{task.title}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Pill value={task.priority} />
                  <Pill value={od ? "OVERDUE" : task.status} label={TASK_STATUS_LABELS[od ? "OVERDUE" : task.status]} />
                  <span className="badge bg-slate-100 text-slate-600">{task.type.replace(/_/g, " ")}</span>
                  <span className="badge bg-brand-50 text-brand-700">{task.pointsValue} pts</span>
                </div>
              </div>
            </div>
            {task.description && <p className="mt-3 text-sm text-ink-soft">{task.description}</p>}
            {task.rejectReason && task.status === "REJECTED" && (
              <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                <strong>Returned for rework:</strong> {task.rejectReason}
              </div>
            )}
            {task.proofUrl && (
              <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                <strong>Proof:</strong> {task.proofUrl}
              </div>
            )}
          </Card>

          {task.checklist.length > 0 && (
            <Card>
              <SectionTitle>Checklist</SectionTitle>
              {task.checklist.map((c) => (
                <ChecklistItem key={c.id} id={c.id} taskId={task.id} label={c.label} done={c.done} />
              ))}
            </Card>
          )}

          <Card>
            <SectionTitle>Comments</SectionTitle>
            <div className="space-y-3">
              {task.comments.length === 0 && <p className="text-sm text-ink-muted">No comments yet.</p>}
              {task.comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar name={c.author.name} color={c.author.avatarColor} size={28} />
                  <div>
                    <div className="text-xs text-ink-muted">{c.author.name} · {dateTime(c.createdAt)}</div>
                    <div className="text-sm text-ink-soft">{c.body}</div>
                  </div>
                </div>
              ))}
            </div>
            <CommentBox taskId={task.id} />
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <SectionTitle>Actions</SectionTitle>
            <WorkflowButtons taskId={task.id} status={task.status} canApprove={canApprove} />
          </Card>

          <Card>
            <SectionTitle>Details</SectionTitle>
            <dl className="space-y-2 text-sm">
              <Row label="Assignee" value={task.assignee ? <span className="flex items-center gap-2"><Avatar name={task.assignee.name} color={task.assignee.avatarColor} size={22} />{task.assignee.name}</span> : "—"} />
              <Row label="Reviewer" value={task.reviewer?.name ?? "—"} />
              <Row label="Department" value={task.department?.name ?? "—"} />
              <Row label="Customer" value={task.customer?.name ?? "—"} />
              <Row label="Job" value={task.job ? <Link href={`/jobs/${task.job.id}`} className="text-brand-600">{task.job.jobNumber}</Link> : "—"} />
              <Row label="Deadline" value={shortDate(task.deadline)} />
              <Row label="Created" value={dateTime(task.createdAt)} />
              {task.approvedAt && <Row label="Approved" value={dateTime(task.approvedAt)} />}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
