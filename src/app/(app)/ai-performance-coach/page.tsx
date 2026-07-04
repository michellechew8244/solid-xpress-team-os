import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { dateTime } from "@/lib/format";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { AICoachPanel } from "@/components/AICoachPanel";

export default async function AICoachPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  const boss = isBoss(me.role);
  const manage = boss || me.role === "DEPARTMENT_HEAD" || me.role === "HR_ADMIN";

  const [departments, people, recent] = await Promise.all([
    prisma.department.findMany({ where: { status: "ACTIVE", ...(me.role === "DEPARTMENT_HEAD" && me.departmentId ? { id: me.departmentId } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    manage
      ? prisma.user.findMany({ where: { isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] }, NOT: { email: { endsWith: "@solidxpress.system" } }, ...(me.role === "DEPARTMENT_HEAD" && me.departmentId ? { departmentId: me.departmentId } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.aIAnalysisLog.findMany({ where: boss ? {} : { OR: [{ userId: me.id }, { generatedBy: me.id }] }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, analysisType: true, month: true, createdAt: true, outputText: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="🤖 AI Performance Coach"
        subtitle="Data-grounded analysis of company, department and personal performance. The coach analyses and drafts — approvals always stay with people."
      />

      <Card className="mb-5">
        <SectionTitle>Generate analysis</SectionTitle>
        <AICoachPanel month={currentPeriod()} canBoss={boss} canManage={manage} departments={departments} people={people} />
      </Card>

      <Card className="mb-5 p-4 text-xs text-ink-muted">
        <b className="text-ink">AI rules:</b> every figure comes from recorded app data — nothing is invented; missing data is reported as missing.
        Facts are separated from suggestions. The AI never approves commission, bonus, deductions, diamonds, attendance corrections or promotions.
      </Card>

      {recent.length > 0 && (
        <Card>
          <SectionTitle>Recent analyses</SectionTitle>
          <div className="space-y-2">
            {recent.map((r) => (
              <details key={r.id} className="rounded-lg border border-slate-100 p-2">
                <summary className="cursor-pointer text-sm font-semibold">{r.analysisType} · {r.month} <span className="text-xs font-normal text-ink-muted">· {dateTime(r.createdAt)}</span></summary>
                <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-soft">{r.outputText}</div>
              </details>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
