import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { Card, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { getDiamondAuthoritySetting } from "@/lib/diamonds";
import { RequestForm, ApproveReject } from "@/components/diamonds/RequestControls";
import { requireFeature } from "@/lib/features";

const STATUS_PILL: Record<string, string> = { PENDING_OWNER_APPROVAL: "WARN", APPROVED: "OK", COMPLETED: "OK", REJECTED: "DANGER" };

export default async function DiamondRequestsPage() {
  await requireFeature("diamond-requests");
  const user = await getCurrentUser();
  if (!user) return null;
  const owner = isBoss(user.role);
  const canPropose = user.role === "HR_ADMIN" || user.role === "DEPARTMENT_HEAD";

  const setting = await getDiamondAuthoritySetting();
  const deptScope = owner ? {} : user.role === "DEPARTMENT_HEAD" ? { departmentId: user.departmentId ?? "" } : {};

  const [requests, staff, departments, requesters] = await Promise.all([
    prisma.diamondRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    canPropose ? prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, ...deptScope }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    canPropose ? prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const nameOf = new Map(requesters.map((r) => [r.id, r.name]));

  // HR/Dept-Head only see their own proposals; Owner sees all.
  const visible = owner ? requests : requests.filter((r) => r.requestedById === user.id);
  const propositionAllowed = (user.role === "HR_ADMIN" && setting.allowHrPropose) || (user.role === "DEPARTMENT_HEAD" && setting.allowDeptHeadPropose);

  return (
    <>
      <PageHeader title="Diamond Requests" subtitle={owner ? "Approve or reject diamond bonus proposals." : "Propose diamond bonuses for Owner approval."} />

      {canPropose && (
        <Card className="mb-6">
          <SectionTitle>Propose a diamond bonus</SectionTitle>
          {propositionAllowed ? (
            <RequestForm staff={staff} departments={departments} allowDept={user.role === "DEPARTMENT_HEAD" || user.role === "HR_ADMIN"} />
          ) : (
            <p className="text-sm text-ink-muted">Diamond proposals are currently disabled for your role by the Owner.</p>
          )}
        </Card>
      )}

      <Card className="p-0">
        <div className="p-4 pb-1"><SectionTitle>{owner ? "All requests" : "My requests"} ({visible.length})</SectionTitle></div>
        <div className="divide-y divide-slate-100">
          {visible.length === 0 && <p className="p-5 text-sm text-ink-muted">No requests yet.</p>}
          {visible.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">{r.amount} 💎 · {r.reason}</div>
                <div className="text-xs text-ink-muted">
                  {r.targetUserId ? `Staff: ${nameOf.get(r.targetUserId) ?? "—"}` : r.departmentId ? "Whole department" : "—"} · by {nameOf.get(r.requestedById) ?? "—"} · {dateTime(r.createdAt)}
                  {r.decidedReason ? ` · Reason: ${r.decidedReason}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Pill value={STATUS_PILL[r.status] ?? "WARN"} label={r.status.replace(/_/g, " ")} />
                {owner && r.status === "PENDING_OWNER_APPROVAL" && <ApproveReject requestId={r.id} />}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
