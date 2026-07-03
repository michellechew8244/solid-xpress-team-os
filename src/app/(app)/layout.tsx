import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFeatureOverrides, navForUser } from "@/lib/features";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Sidebar honours per-user feature rights/restrictions on top of the role.
  const overrides = await getFeatureOverrides(user.id);
  const groups = navForUser(user.role, overrides);

  return (
    <div className="min-h-screen">
      <Sidebar role={user.role} groups={groups} />
      <div className="md:pl-64">
        <Topbar
          user={{
            id: user.id,
            name: user.name,
            role: user.role,
            avatarColor: user.avatarColor,
            officialLevel: user.officialLevel,
            currentPoints: user.currentPoints,
            department: user.department,
          }}
        />
        <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
