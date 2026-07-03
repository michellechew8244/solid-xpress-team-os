import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { rm } from "@/lib/format";
import { Avatar, Card, PageHeader, SectionTitle } from "@/components/ui";
import { NewDepartmentForm, EditDepartmentForm } from "@/components/DepartmentForms";
import { requireFeature } from "@/lib/features";

export default async function DepartmentsPage() {
  await requireFeature("departments");
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canManageUsers(user.role)) redirect("/dashboard");

  const [departments, people] = await Promise.all([
    prisma.department.findMany({
      include: { _count: { select: { users: true, kpis: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, departmentId: true } }),
  ]);

  // Resolve head names.
  const headIds = departments.map((d) => d.headId).filter(Boolean) as string[];
  const heads = await prisma.user.findMany({ where: { id: { in: headIds } }, select: { id: true, name: true, avatarColor: true } });
  const headMap = new Map(heads.map((h) => [h.id, h]));

  return (
    <>
      <PageHeader title="Department Management" subtitle={`${departments.length} departments`} action={<NewDepartmentForm />} />

      <div className="grid gap-4 lg:grid-cols-2">
        {departments.map((d) => {
          const head = d.headId ? headMap.get(d.headId) : null;
          return (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-ink">{d.name}</h2>
                  {d.description && <p className="text-sm text-ink-muted">{d.description}</p>}
                </div>
                <EditDepartmentForm
                  dept={{ id: d.id, description: d.description, headId: d.headId, revenueTarget: d.revenueTarget, grossProfitTarget: d.grossProfitTarget }}
                  people={people}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-ink-muted">Head:</span>
                {head ? <span className="flex items-center gap-1.5"><Avatar name={head.name} color={head.avatarColor} size={22} /> {head.name}</span> : <span className="text-ink-muted">— not assigned —</span>}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <Stat label="Staff" value={d._count.users} />
                <Stat label="KPIs" value={d._count.kpis} />
                <Stat label="Rev Target" value={d.revenueTarget ? rm(d.revenueTarget) : "—"} />
                <Stat label="GP Target" value={d.grossProfitTarget ? rm(d.grossProfitTarget) : "—"} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-sm font-bold text-ink">{value}</div>
      <div className="text-[10px] uppercase text-ink-muted">{label}</div>
    </div>
  );
}
