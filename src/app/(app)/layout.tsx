import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getFeatureOverrides, navForUser } from "@/lib/features";
import { klNow } from "@/lib/attendance";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { Topbar } from "@/components/Topbar";
import { BirthdayPopup } from "@/components/BirthdayPopup";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Force a password change before anything else (temp passwords / admin resets).
  if (user.mustChangePassword) redirect("/change-password");

  // Sidebar honours per-user feature rights/restrictions on top of the role.
  const overrides = await getFeatureOverrides(user.id);
  const groups = navForUser(user.role, overrides);

  // 🎂 Today's birthdays (KL calendar): match on month-day of dateOfBirth.
  const todayKey = klNow().dateStr.slice(5); // "MM-DD"
  const bdayPeople = (
    await prisma.user.findMany({ where: { isActive: true, dateOfBirth: { not: null } }, select: { id: true, name: true, dateOfBirth: true } })
  ).filter((u) => u.dateOfBirth && u.dateOfBirth.toISOString().slice(5, 10) === todayKey);
  const birthday = {
    todayKey,
    names: bdayPeople.map((u) => u.name),
    isMine: bdayPeople.some((u) => u.id === user.id),
  };

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
        {/* Extra bottom padding on mobile so content clears the bottom tab bar. */}
        <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-6 pb-24 md:px-6 md:pb-6">{children}</main>
      </div>
      <MobileNav groups={groups} />
      <BirthdayPopup info={birthday} />
    </div>
  );
}
