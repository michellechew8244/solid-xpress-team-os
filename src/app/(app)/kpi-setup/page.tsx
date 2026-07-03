import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss, canApproveTasks } from "@/lib/rbac";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { NewKpiForm, KpiToggle } from "@/components/KpiSetupForms";
import { requireFeature } from "@/lib/features";

export default async function KpiSetupPage() {
  await requireFeature("kpi-setup");
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canApproveTasks(user.role)) redirect("/dashboard"); // boss / management / dept head

  const deptFilter = isBoss(user.role) ? {} : { id: user.departmentId ?? "" };
  const departments = await prisma.department.findMany({
    where: deptFilter,
    include: { kpis: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  const deptOptions = departments.map((d) => ({ id: d.id, name: d.name }));

  return (
    <>
      <PageHeader
        title="KPI Setup"
        subtitle="Define KPIs, targets, weightage and point rules per department"
        action={<NewKpiForm departments={deptOptions} lockedDept={isBoss(user.role) ? null : user.departmentId} />}
      />

      <div className="space-y-6">
        {departments.filter((d) => isBoss(user.role) || d.kpis.length >= 0).map((d) => (
          <Card key={d.id}>
            <SectionTitle>{d.name} · {d.kpis.length} KPIs</SectionTitle>
            {d.kpis.length === 0 ? (
              <p className="text-sm text-ink-muted">No KPIs yet — add one above.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                      <th className="py-2 pr-2">KPI</th><th className="px-2">Category</th><th className="px-2">Freq</th><th className="px-2 text-right">Target</th><th className="px-2 text-right">Weight</th><th className="px-2 text-right">×Mult</th><th className="px-2 text-right">Max</th><th className="px-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.kpis.map((k) => (
                      <tr key={k.id}>
                        <td className="py-2 pr-2 font-medium text-ink">{k.name}{k.evidenceRequired && <span className="ml-1 text-xs text-amber-600" title="Evidence required">📎</span>}</td>
                        <td className="px-2 text-xs text-ink-muted">{k.category ?? "—"}</td>
                        <td className="px-2 text-xs">{k.frequency}</td>
                        <td className="px-2 text-right">{k.targetValue.toLocaleString()} {k.unit ?? ""}</td>
                        <td className="px-2 text-right">{k.weightage}</td>
                        <td className="px-2 text-right">{k.pointMultiplier}</td>
                        <td className="px-2 text-right text-ok">{k.maxPoints}</td>
                        <td className="px-2 text-center"><KpiToggle id={k.id} active={k.status === "ACTIVE"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
