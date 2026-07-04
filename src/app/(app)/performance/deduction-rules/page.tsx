import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { Card, PageHeader, SectionTitle, Pill } from "@/components/ui";
import { RuleForm, RuleRowActions, SeedRulesButton } from "@/components/DeductionControls";

const SEV_PILL: Record<string, string> = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", CRITICAL: "URGENT", RED_LINE: "OVERDUE" };
const lab = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default async function DeductionRulesPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!isBoss(me.role) && me.role !== "HR_ADMIN") redirect("/dashboard");
  const canEdit = isBoss(me.role);

  const [rules, departments] = await Promise.all([
    prisma.penaltyRule.findMany({ orderBy: [{ category: "asc" }, { deductionPoints: "asc" }] }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <>
      <PageHeader
        title="⚖️ Deduction Rule Centre"
        subtitle="Configurable deduction rules by category, severity and department. Deductions run through the case workflow — staff always see the reason and can explain."
        action={canEdit && rules.length < 10 ? <SeedRulesButton /> : undefined}
      />

      <Card className="mb-5 p-4 text-xs text-ink-muted">
        <b className="text-ink">Protected external issues (never deduct if updated properly):</b> vessel delay · port congestion · customs inspection ·
        government system issue · customer late document · weather · liner delay · supplier issue outside staff control.
      </Card>

      {canEdit && (
        <Card className="mb-5">
          <SectionTitle>Add a deduction rule</SectionTitle>
          <RuleForm departments={departments} />
        </Card>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                <th className="px-4 py-3">Rule</th><th className="px-3">Category</th><th className="px-3">Severity</th>
                <th className="px-3">Diamonds</th><th className="px-3">Scope</th><th className="px-3">Coaching</th>{canEdit && <th className="px-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{r.name}{r.description && <div className="text-[11px] font-normal text-ink-muted">{r.description}</div>}</td>
                  <td className="px-3 text-xs">{lab(r.category)}</td>
                  <td className="px-3"><Pill value={SEV_PILL[r.severity] ?? "MEDIUM"} label={lab(r.severity)} /></td>
                  <td className="px-3 font-bold text-danger">{r.isRedLine ? "Review" : `−${r.deductionPoints}`}</td>
                  <td className="px-3 text-xs text-ink-muted">{r.departmentId ? deptName.get(r.departmentId) ?? "—" : "All"}</td>
                  <td className="px-3 text-xs">{r.coachingTrigger ? "🎓 yes" : "—"}</td>
                  {canEdit && <td className="px-3"><RuleRowActions id={r.id} /></td>}
                </tr>
              ))}
              {rules.length === 0 && <tr><td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-sm text-ink-muted">No rules yet — load the universal set above.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
