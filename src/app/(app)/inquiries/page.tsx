import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { dateTime, shortDate } from "@/lib/format";
import { inquiryResolution, CLOSURE_TYPES } from "@/lib/result-kpi";
import { Card, PageHeader, SectionTitle, StatCard, Pill } from "@/components/ui";
import { AssignInquiryForm, InquiryRowActions } from "@/components/InquiryControls";

const STATUS_PILL: Record<string, string> = { OPEN: "WAITING_EXTERNAL", IN_PROGRESS: "IN_PROGRESS", RESOLVED: "COMPLETED", LOST: "LOW" };

export default async function InquiriesPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  const manager = isBoss(me.role) || me.role === "DEPARTMENT_HEAD" || me.role === "HR_ADMIN";
  const period = currentPeriod();

  const scope = manager
    ? await prisma.user.findMany({ where: { isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] }, NOT: { email: { endsWith: "@solidxpress.system" } }, ...(me.role === "DEPARTMENT_HEAD" && me.departmentId ? { departmentId: me.departmentId } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  const scopeIds = scope.map((u) => u.id);
  const nameById = new Map([...scope, { id: me.id, name: me.name }].map((u) => [u.id, u.name]));

  const [inquiries, myOutcome] = await Promise.all([
    prisma.assignedInquiry.findMany({
      where: manager ? { assignedToId: { in: [...scopeIds, me.id] } } : { assignedToId: me.id },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 250,
    }),
    inquiryResolution(me.id, period),
  ]);
  const now = new Date();
  const closureLabel = new Map(CLOSURE_TYPES.map((c) => [c.key, c.label]));

  // Team resolution summary for managers.
  const teamRates = manager
    ? await Promise.all(scope.map(async (u) => ({ ...u, out: await inquiryResolution(u.id, period) })))
    : [];

  return (
    <>
      <PageHeader
        title="📨 Assigned Inquiries"
        subtitle="Only assigned inquiries count. Resolution score = properly closed ÷ due. Unassigned inquiries are the Team Head's allocation responsibility."
      />

      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Assigned (this month)" value={myOutcome.assigned} icon="📨" rag="neutral" />
        <StatCard label="My Resolved" value={myOutcome.resolved} icon="✅" rag="ok" />
        <StatCard label="My Resolution Rate" value={myOutcome.due > 0 ? `${myOutcome.ratePct}%` : "—"} icon="🎯" rag={myOutcome.due === 0 || myOutcome.ratePct >= 90 ? "ok" : myOutcome.ratePct >= 70 ? "warn" : "danger"} />
        <StatCard label="My Overdue" value={myOutcome.overdue} icon="⏰" rag={myOutcome.overdue === 0 ? "ok" : "danger"} />
      </div>

      {manager && (
        <Card className="mb-5">
          <SectionTitle>Assign an inquiry</SectionTitle>
          {scope.length === 0 ? <p className="text-sm text-ink-muted">No staff in scope.</p> : <AssignInquiryForm people={scope} />}
        </Card>
      )}

      {manager && teamRates.length > 0 && (
        <Card className="mb-5">
          <SectionTitle>Team resolution — {period}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {teamRates.filter((t) => t.out.assigned > 0).map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-ink-muted">{t.out.resolved}/{t.out.due} due resolved ({t.out.due ? t.out.ratePct : 100}%){t.out.overdue ? ` · ${t.out.overdue} overdue ⚠️` : ""}</div>
              </div>
            ))}
            {teamRates.every((t) => t.out.assigned === 0) && <p className="text-sm text-ink-muted">No inquiries assigned this month yet.</p>}
          </div>
        </Card>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                <th className="px-4 py-3">Inquiry</th><th className="px-3">Customer</th><th className="px-3">Type</th>
                <th className="px-3">Assigned to</th><th className="px-3">Due</th><th className="px-3">Status</th><th className="px-3">Closure</th><th className="px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inquiries.map((q) => {
                const overdue = ["OPEN", "IN_PROGRESS"].includes(q.status) && q.dueAt && q.dueAt < now;
                return (
                  <tr key={q.id} className={`hover:bg-slate-50 ${overdue ? "bg-rose-50/40" : ""}`}>
                    <td className="px-4 py-2 text-xs font-semibold">{q.inquiryNo}{q.note && <div className="font-normal text-ink-muted">{q.note}</div>}</td>
                    <td className="px-3 text-xs">{q.customerName ?? "—"}</td>
                    <td className="px-3 text-xs">{q.inquiryType.replace(/_/g, " ")}</td>
                    <td className="px-3 text-xs">{nameById.get(q.assignedToId) ?? "—"}</td>
                    <td className={`px-3 text-xs ${overdue ? "font-bold text-danger" : "text-ink-muted"}`}>{q.dueAt ? shortDate(q.dueAt) : "—"}{overdue ? " ⚠️" : ""}</td>
                    <td className="px-3"><Pill value={STATUS_PILL[q.status] ?? "WAITING_EXTERNAL"} label={q.status.replace(/_/g, " ")} /></td>
                    <td className="px-3 text-xs text-ink-muted">
                      {q.closureType ? closureLabel.get(q.closureType) ?? q.closureType : "—"}
                      {q.lostReason && <div>Lost: {q.lostReason}</div>}
                      {q.followUpProofUrl && <a href={q.followUpProofUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">proof</a>}
                      {q.closedAt && <div>{dateTime(q.closedAt)}</div>}
                    </td>
                    <td className="px-3"><InquiryRowActions id={q.id} status={q.status} mine={q.assignedToId === me.id} /></td>
                  </tr>
                );
              })}
              {inquiries.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-ink-muted">No inquiries yet{manager ? " — assign the first one above" : ""}.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
