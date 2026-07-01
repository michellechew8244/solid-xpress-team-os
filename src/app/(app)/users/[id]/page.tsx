import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { currentPeriod, GRADE_LABEL, growthLevelName } from "@/lib/enums";
import { dateTime, shortDate } from "@/lib/format";
import {
  canViewUser, editScope, canResetPassword, canDeactivateUsers, canAssignRole,
  ROLE_BADGE, ROLE_SHORT, EMPLOYMENT_STATUS_BADGE, ACCESS_STATUS_BADGE, MANAGEABLE_ROLES,
} from "@/lib/user-permissions";
import { isBoss } from "@/lib/rbac";
import { hasOnboardingBonus } from "@/lib/onboarding-bonus";
import { Avatar, Card, PageHeader, SectionTitle } from "@/components/ui";
import { UserRowActions } from "@/components/UserAdminActions";
import { OnboardingBonusControls } from "@/components/OnboardingBonusControls";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-sm font-medium text-ink">{value ?? "—"}</div>
    </div>
  );
}

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id }, include: { department: true, manager: true } });
  if (!user) notFound();
  if (!canViewUser({ id: me.id, role: me.role, departmentId: me.departmentId }, { id: user.id, role: user.role, departmentId: user.departmentId })) {
    redirect("/dashboard");
  }

  const period = currentPeriod();
  const [review, badgeCount, redeemedCount, rankAbove, creator, updater, onboardingIssued] = await Promise.all([
    prisma.performanceReview.findFirst({ where: { staffId: user.id, period } }),
    prisma.userBadge.count({ where: { userId: user.id } }),
    prisma.rewardRedemption.count({ where: { userId: user.id, status: { in: ["APPROVED", "FULFILLED"] } } }),
    prisma.user.count({ where: { isActive: true, currentPoints: { gt: user.currentPoints } } }),
    user.createdBy ? prisma.user.findUnique({ where: { id: user.createdBy }, select: { name: true } }) : null,
    user.updatedBy ? prisma.user.findUnique({ where: { id: user.updatedBy }, select: { name: true } }) : null,
    hasOnboardingBonus(user.id),
  ]);

  // Onboarding-bonus management: Boss/HR can see it; Boss (and HR when allowed)
  // can award manually; only Boss can reverse. Not shown for manager/admin roles.
  const isStaffAccount = user.role === "STAFF" || user.role === "DEPARTMENT_HEAD";
  const canManageOnboarding = isBoss(me.role) || me.role === "HR_ADMIN";
  const onboardingBonusAmount = onboardingIssued
    ? (await prisma.pointsTransaction.aggregate({ where: { userId: user.id, sourceType: "NEW_ONBOARDING", amount: { gt: 0 } }, _sum: { amount: true } }))._sum.amount ?? 0
    : 0;

  const scope = editScope({ id: me.id, role: me.role, departmentId: me.departmentId }, { id: user.id, role: user.role, departmentId: user.departmentId });
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const managers = (await prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }));
  const assignableRoles = MANAGEABLE_ROLES.filter((r) => canAssignRole(me.role, r));

  return (
    <>
      <PageHeader
        title={user.name}
        subtitle={`${ROLE_SHORT[user.role] ?? user.role} · ${user.department?.name ?? "—"}`}
        action={<Link href="/users" className="btn-ghost">← Back to list</Link>}
      />

      <div className="mb-6 flex items-center gap-4">
        <Avatar name={user.name} color={user.avatarColor} size={64} />
        <div>
          <div className="flex items-center gap-2">
            <span className={`badge ${ROLE_BADGE[user.role] ?? ""}`}>{ROLE_SHORT[user.role] ?? user.role}</span>
            <span className={`badge ${EMPLOYMENT_STATUS_BADGE[user.employmentStatus] ?? "bg-slate-100"}`}>{user.employmentStatus}</span>
            <span className={`badge ${ACCESS_STATUS_BADGE[user.accessStatus] ?? ""}`}>{user.accessStatus}</span>
          </div>
          <div className="mt-1 text-sm text-ink-muted">{user.email} · {user.employeeCode ?? "no code"}</div>
        </div>
      </div>

      {/* Management actions */}
      {(scope !== "none" || canResetPassword(me.role, user.role) || canDeactivateUsers(me.role)) && (
        <Card className="mb-6">
          <SectionTitle>Management Actions</SectionTitle>
          <UserRowActions
            user={{ id: user.id, name: user.name, email: user.email, employeeCode: user.employeeCode, role: user.role, jobTitle: user.jobTitle, phoneNumber: user.phoneNumber, avatarUrl: user.avatarUrl, departmentId: user.departmentId, managerId: user.managerId, employmentType: user.employmentType, employmentStatus: user.employmentStatus, accessStatus: user.accessStatus }}
            scope={scope}
            canReset={canResetPassword(me.role, user.role)}
            canToggle={canDeactivateUsers(me.role)}
            departments={departments}
            managers={managers}
            roles={assignableRoles}
          />
        </Card>
      )}

      {canManageOnboarding && isStaffAccount && (
        <Card className="mb-6">
          <SectionTitle>💎 New Staff Onboarding Bonus</SectionTitle>
          <OnboardingBonusControls
            userId={user.id}
            issued={onboardingIssued}
            amount={onboardingBonusAmount}
            canAward={isBoss(me.role) || me.role === "HR_ADMIN"}
            canReverse={isBoss(me.role)}
          />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>A · Basic Information</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" value={user.name} />
            <Field label="Employee Code" value={user.employeeCode} />
            <Field label="Email" value={user.email} />
            <Field label="Phone" value={user.phoneNumber} />
            <Field label="Department" value={user.department?.name} />
            <Field label="Job Title" value={user.jobTitle} />
            <Field label="Role" value={ROLE_SHORT[user.role] ?? user.role} />
            <Field label="Manager" value={user.manager?.name} />
            <Field label="Join Date" value={shortDate(user.joinDate)} />
            <Field label="Employment Type" value={user.employmentType.replace(/_/g, " ")} />
            <Field label="Employment Status" value={user.employmentStatus} />
            <Field label="Access Status" value={user.accessStatus} />
          </div>
        </Card>

        <Card>
          <SectionTitle>B · Performance Summary</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Monthly Score" value={review ? Math.round(review.totalScore) : "—"} />
            <Field label="Grade" value={review?.finalGrade ? GRADE_LABEL[review.finalGrade] : "—"} />
            <Field label="Current Diamonds" value={user.currentPoints.toLocaleString()} />
            <Field label="Ranking" value={`#${rankAbove + 1}`} />
            <Field label="Monthly Earned" value={`+${user.monthlyEarned}`} />
            <Field label="Monthly Deducted" value={`-${user.monthlyDeducted}`} />
            <Field label="Badges Earned" value={badgeCount} />
            <Field label="Rewards Redeemed" value={redeemedCount} />
            <Field label="Growth Level" value={`Lv.${user.officialLevel} · ${growthLevelName(user.officialLevel)}`} />
            <Field label="Latest Review" value={review ? `${review.period} (${review.finalGrade ? GRADE_LABEL[review.finalGrade] : "—"})` : "none yet"} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Link href="/kpi" className="btn-ghost px-3 py-1">View KPI</Link>
            <Link href="/wallet" className="btn-ghost px-3 py-1">View Diamonds</Link>
            <Link href="/rewards" className="btn-ghost px-3 py-1">View Rewards</Link>
            <Link href="/reviews" className="btn-ghost px-3 py-1">Performance Review</Link>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>C · Access Information</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Last Login" value={user.lastLoginAt ? dateTime(user.lastLoginAt) : "never"} />
            <Field label="Account Created" value={dateTime(user.createdAt)} />
            <Field label="Last Updated" value={dateTime(user.updatedAt)} />
            <Field label="Created By" value={creator?.name} />
            <Field label="Updated By" value={updater?.name} />
          </div>
        </Card>
      </div>
    </>
  );
}
