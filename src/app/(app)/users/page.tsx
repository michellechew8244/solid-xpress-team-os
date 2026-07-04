import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { dateTime, shortDate, maskId } from "@/lib/format";
import { isBoss } from "@/lib/rbac";
import {
  canAccessUserAdmin, canCreateUsers, canDeactivateUsers, canResetPassword,
  canAssignRole, editScope, userListScope,
  ROLE_BADGE, ROLE_SHORT, EMPLOYMENT_STATUS_BADGE, ACCESS_STATUS_BADGE, MANAGEABLE_ROLES,
} from "@/lib/user-permissions";
import { Avatar, Card, PageHeader, StatCard } from "@/components/ui";
import { NewUserForm } from "@/components/NewUserForm";
import { UserFilters } from "@/components/UserFilters";
import { UserRowActions } from "@/components/UserAdminActions";
import { SignupApprovalPanel } from "@/components/SignupApprovalPanel";
import type { Prisma } from "@prisma/client";
import { requireFeature } from "@/lib/features";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireFeature("user-management");
  const me = await getCurrentUser();
  if (!me) return null;
  if (!canAccessUserAdmin(me.role)) redirect("/dashboard");

  const sp = await searchParams;
  const scopeWhere = userListScope({ id: me.id, role: me.role, departmentId: me.departmentId });

  // Build filtered query.
  const where: Prisma.UserWhereInput = { ...scopeWhere, NOT: { email: { endsWith: "@solidxpress.system" } } };
  if (sp.dept) where.departmentId = sp.dept;
  if (sp.role) where.role = sp.role;
  if (sp.status) where.employmentStatus = sp.status;
  if (sp.access) where.accessStatus = sp.access;
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q } },
      { email: { contains: sp.q } },
      { employeeCode: { contains: sp.q } },
    ];
  }

  // Self-signups awaiting management approval (Boss/Management only).
  const pendingSignups = isBoss(me.role)
    ? await prisma.user.findMany({
        where: { signupStatus: "PENDING" },
        orderBy: { createdAt: "asc" },
        include: { department: { select: { name: true } } },
      })
    : [];

  const [users, departments, allInScope] = await Promise.all([
    prisma.user.findMany({ where: { ...where, signupStatus: { not: "PENDING" } }, include: { department: true, manager: true }, orderBy: [{ department: { name: "asc" } }, { name: "asc" }] }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: scopeWhere, select: { role: true, accessStatus: true, employmentStatus: true, joinDate: true } }),
  ]);

  // Dashboard cards.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const cards = {
    total: allInScope.length,
    active: allInScope.filter((u) => u.accessStatus === "ACTIVE").length,
    inactive: allInScope.filter((u) => u.accessStatus !== "ACTIVE").length,
    heads: allInScope.filter((u) => u.role === "DEPARTMENT_HEAD").length,
    newJoiners: allInScope.filter((u) => new Date(u.joinDate) >= monthStart).length,
    probation: allInScope.filter((u) => u.employmentStatus === "PROBATION").length,
  };

  const managers = users.map((u) => ({ id: u.id, name: u.name }));
  const assignableRoles = MANAGEABLE_ROLES.filter((r) => canAssignRole(me.role, r));

  return (
    <>
      <PageHeader
        title="User Management"
        subtitle="Manage staff accounts, roles, departments, reporting lines and access status."
        action={canCreateUsers(me.role) ? <NewUserForm departments={departments} managers={managers} roles={assignableRoles} /> : undefined}
      />

      <SignupApprovalPanel
        pending={pendingSignups.map((u) => ({
          id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, avatarColor: u.avatarColor,
          departmentName: u.department?.name ?? null, nationalId: maskId(u.nationalId),
          dobLabel: u.dateOfBirth ? shortDate(u.dateOfBirth) : null, requestedLabel: dateTime(u.createdAt),
        }))}
      />

      {/* Dashboard cards */}
      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-6">
        <StatCard label="Total Users" value={cards.total} rag="neutral" />
        <StatCard label="Active" value={cards.active} rag="ok" />
        <StatCard label="Inactive" value={cards.inactive} rag={cards.inactive ? "warn" : "ok"} />
        <StatCard label="Dept Heads" value={cards.heads} rag="neutral" />
        <StatCard label="New This Month" value={cards.newJoiners} rag="neutral" />
        <StatCard label="On Probation" value={cards.probation} rag={cards.probation ? "warn" : "ok"} />
      </div>

      <UserFilters departments={departments} roles={MANAGEABLE_ROLES} />

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                <th className="px-4 py-3">Code</th><th className="px-3">Name</th><th className="px-3">Department</th>
                <th className="px-3">Job Title</th><th className="px-3">Role</th><th className="px-3">Manager</th>
                <th className="px-3">Employment</th><th className="px-3">Access</th><th className="px-3">Last Login</th><th className="px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const scope = editScope({ id: me.id, role: me.role, departmentId: me.departmentId }, { id: u.id, role: u.role, departmentId: u.departmentId });
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs text-ink-muted">{u.employeeCode ?? "—"}</td>
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} color={u.avatarColor} size={28} />
                        <div><div className="font-semibold text-ink">{u.name}</div><div className="text-xs text-ink-muted">{u.email}</div></div>
                      </div>
                    </td>
                    <td className="px-3 text-ink-soft">{u.department?.name ?? "—"}</td>
                    <td className="px-3 text-xs text-ink-soft">{u.jobTitle ?? "—"}</td>
                    <td className="px-3"><span className={`badge ${ROLE_BADGE[u.role] ?? ""}`}>{ROLE_SHORT[u.role] ?? u.role}</span></td>
                    <td className="px-3 text-xs text-ink-muted">{u.manager?.name ?? "—"}</td>
                    <td className="px-3"><span className={`badge ${EMPLOYMENT_STATUS_BADGE[u.employmentStatus] ?? "bg-slate-100 text-slate-600"}`}>{u.employmentStatus}</span></td>
                    <td className="px-3"><span className={`badge ${ACCESS_STATUS_BADGE[u.accessStatus] ?? ""}`}>{u.accessStatus}</span></td>
                    <td className="px-3 text-xs text-ink-muted">{u.lastLoginAt ? dateTime(u.lastLoginAt) : "never"}</td>
                    <td className="px-3">
                      <UserRowActions
                        user={{ id: u.id, name: u.name, email: u.email, employeeCode: u.employeeCode, role: u.role, jobTitle: u.jobTitle, phoneNumber: u.phoneNumber, avatarUrl: u.avatarUrl, dateOfBirth: u.dateOfBirth ? u.dateOfBirth.toISOString().slice(0, 10) : null, departmentId: u.departmentId, managerId: u.managerId, employmentType: u.employmentType, employmentStatus: u.employmentStatus, accessStatus: u.accessStatus }}
                        scope={scope}
                        canReset={canResetPassword(me.role, u.role)}
                        canToggle={canDeactivateUsers(me.role)}
                        canDelete={isBoss(me.role) && !isBoss(u.role)}
                        departments={departments}
                        managers={managers}
                        roles={assignableRoles}
                      />
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-ink-muted">No users match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
