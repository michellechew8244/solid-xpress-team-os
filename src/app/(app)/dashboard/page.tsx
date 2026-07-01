import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { BossDashboard } from "@/components/dashboard/BossDashboard";
import { DeptDashboard } from "@/components/dashboard/DeptDashboard";
import { StaffHome } from "@/components/dashboard/StaffHome";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Boss / Management → company-wide dashboard.
  if (isBoss(user.role)) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} subtitle="Company-wide performance at a glance" />
        <BossDashboard name={user.name} />
      </>
    );
  }

  // Department Head → own department.
  if (user.role === "DEPARTMENT_HEAD") {
    return (
      <>
        <PageHeader title={`${user.department?.name ?? "Department"} Dashboard`} subtitle="Your team's numbers and blockers" />
        <DeptDashboard departmentId={user.departmentId} />
      </>
    );
  }

  // HR / Finance admins also get a personal home; their specialised modules are
  // in the sidebar (Users / Finance Control).
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} subtitle="Your tasks, KPI, points and growth" />
      <StaffHome userId={user.id} name={user.name} />
    </>
  );
}
