import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canApproveTasks, isBoss } from "@/lib/rbac";
import { shortDate } from "@/lib/format";
import type { Prisma } from "@prisma/client";
import { Avatar, Card, EmptyState, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { NewCoachingForm, AcknowledgeButton } from "@/components/CoachingForms";
import { requireFeature } from "@/lib/features";

export default async function CoachingPage() {
  await requireFeature("coaching");
  const user = await getCurrentUser();
  if (!user) return null;
  const isManager = canApproveTasks(user.role) || user.role === "HR_ADMIN";

  // Scope records.
  const where: Prisma.CoachingRecordWhereInput = {};
  if (!isBoss(user.role) && user.role !== "HR_ADMIN") {
    if (user.role === "DEPARTMENT_HEAD") where.staff = { departmentId: user.departmentId };
    else where.staffId = user.id;
  }

  const records = await prisma.coachingRecord.findMany({
    where,
    include: { staff: true, coach: true },
    orderBy: { createdAt: "desc" },
  });

  const staffForForm = isManager
    ? await prisma.user.findMany({
        where: isBoss(user.role) || user.role === "HR_ADMIN" ? { role: { in: ["STAFF", "DEPARTMENT_HEAD"] } } : { departmentId: user.departmentId, role: "STAFF" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  return (
    <>
      <PageHeader title="Coaching Centre" subtitle="Turn weak performance into an improvement plan" action={isManager ? <NewCoachingForm staff={staffForForm} /> : undefined} />

      {records.length === 0 ? (
        <EmptyState title="No coaching records" hint="Coaching keeps growth on track — create one when needed." />
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={r.staff.name} color={r.staff.avatarColor} size={36} />
                  <div>
                    <div className="font-semibold text-ink">{r.staff.name}</div>
                    <div className="text-xs text-ink-muted">Coach: {r.coach.name} · {shortDate(r.createdAt)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill value={r.category === "BEHAVIOUR" ? "WARN" : "DANGER"} label={r.category.replace(/_/g, " ")} />
                  <Pill value={r.status === "RESOLVED" ? "COMPLETED" : r.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED"} label={r.status} />
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <p><strong>Issue:</strong> {r.issue}</p>
                {r.coachingNote && <p className="text-ink-soft"><strong>Note:</strong> {r.coachingNote}</p>}
                {r.improvementAction && <p className="text-ink-soft"><strong>Action:</strong> {r.improvementAction}</p>}
                {r.deadline && <p className="text-xs text-ink-muted">Follow-up by {shortDate(r.deadline)}</p>}
              </div>
              {r.staffId === user.id && !r.staffAcknowledged && (
                <div className="mt-3"><AcknowledgeButton id={r.id} /></div>
              )}
              {r.staffAcknowledged && <div className="mt-2 text-xs text-ok">✓ Acknowledged by staff</div>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
