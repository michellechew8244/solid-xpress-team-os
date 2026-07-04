import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { Card, PageHeader, SectionTitle, Pill, EmptyState } from "@/components/ui";
import { NewCaseForm, ExplainForm, DecideForm } from "@/components/DeductionControls";

const STATUS_PILL: Record<string, string> = { OPEN: "WAITING_EXTERNAL", EXPLAINED: "IN_PROGRESS", APPROVED: "REJECTED", DISMISSED: "COMPLETED" };
const lab = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default async function DeductionCasesPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  const boss = isBoss(me.role) || me.role === "HR_ADMIN";
  const manager = boss || me.role === "DEPARTMENT_HEAD";

  const cases = await prisma.deductionCase.findMany({
    where: manager
      ? (me.role === "DEPARTMENT_HEAD" && me.departmentId ? { departmentId: me.departmentId } : {})
      : { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(cases.map((c) => c.userId))] } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const people = manager
    ? await prisma.user.findMany({
        where: { isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] }, NOT: { email: { endsWith: "@solidxpress.system" } }, ...(me.role === "DEPARTMENT_HEAD" && me.departmentId ? { departmentId: me.departmentId } : {}) },
        select: { id: true, name: true }, orderBy: { name: "asc" },
      })
    : [];
  const rules = manager
    ? await prisma.penaltyRule.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, category: true, severity: true, deductionPoints: true } })
    : [];

  return (
    <>
      <PageHeader title="⚠️ Deduction Cases" subtitle="Manager raises → staff explains → Boss/HR decides → diamonds move only after approval. Fully audited." />

      {manager && people.length > 0 && (
        <Card className="mb-5">
          <SectionTitle>Raise a deduction case</SectionTitle>
          <NewCaseForm people={people} rules={rules} />
        </Card>
      )}

      <div className="space-y-3">
        {cases.length === 0 && <EmptyState title="No deduction cases" hint="Cases show up here with their full history." />}
        {cases.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-ink">{nameById.get(c.userId) ?? "—"} · <span className="text-danger">−{c.diamondDeducted} 💎</span></div>
                <div className="text-sm text-ink-soft">{c.reason}</div>
                <div className="mt-1 text-xs text-ink-muted">{lab(c.category)} · {lab(c.severity)} · {dateTime(c.createdAt)}{c.evidenceUrl && <> · <a href={c.evidenceUrl} className="text-brand-600 underline" target="_blank">evidence</a></>}</div>
              </div>
              <Pill value={STATUS_PILL[c.status] ?? "WAITING_EXTERNAL"} label={c.status} />
            </div>
            {c.staffExplanation && (
              <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs"><b>Staff explanation:</b> {c.staffExplanation}</div>
            )}
            {c.finalDecision && c.status !== "OPEN" && c.status !== "EXPLAINED" && (
              <div className="mt-2 text-xs text-ink-muted"><b>Decision:</b> {c.finalDecision}</div>
            )}
            {c.status === "OPEN" && c.userId === me.id && <ExplainForm id={c.id} />}
            {["OPEN", "EXPLAINED"].includes(c.status) && boss && <DecideForm id={c.id} />}
          </Card>
        ))}
      </div>
    </>
  );
}
