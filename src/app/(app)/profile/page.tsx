import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { currentPeriod, GRADE_LABEL, growthLevelName } from "@/lib/enums";
import { shortDate, dateTime } from "@/lib/format";
import { ROLE_SHORT, ROLE_BADGE, EMPLOYMENT_STATUS_BADGE } from "@/lib/user-permissions";
import { Avatar, Card, PageHeader, SectionTitle } from "@/components/ui";
import { MyProfileForm } from "@/components/MyProfileForm";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-sm font-medium text-ink">{value ?? "—"}</div>
    </div>
  );
}

export default async function MyProfilePage() {
  const me = await getCurrentUser();
  if (!me) return null;
  const period = currentPeriod();

  const [manager, review, badges, redemptions] = await Promise.all([
    me.managerId ? prisma.user.findUnique({ where: { id: me.managerId }, select: { name: true } }) : null,
    prisma.performanceReview.findFirst({ where: { staffId: me.id, period } }),
    prisma.userBadge.findMany({ where: { userId: me.id }, include: { badge: true } }),
    prisma.rewardRedemption.findMany({ where: { userId: me.id }, include: { reward: true }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  return (
    <>
      <PageHeader title="My Profile" subtitle="View your details and update your phone, avatar and password." />

      <div className="mb-6 flex items-center gap-4">
        <Avatar name={me.name} color={me.avatarColor} size={64} />
        <div>
          <div className="text-lg font-bold text-ink">{me.name}</div>
          <div className="flex items-center gap-2">
            <span className={`badge ${ROLE_BADGE[me.role] ?? ""}`}>{ROLE_SHORT[me.role] ?? me.role}</span>
            <span className={`badge ${EMPLOYMENT_STATUS_BADGE[me.employmentStatus] ?? "bg-slate-100"}`}>{me.employmentStatus}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>My Details</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" value={me.email} />
            <Field label="Employee Code" value={me.employeeCode} />
            <Field label="Department" value={me.department?.name} />
            <Field label="Job Title" value={me.jobTitle} />
            <Field label="Manager" value={manager?.name} />
            <Field label="Join Date" value={shortDate(me.joinDate)} />
            <Field label="Last Login" value={me.lastLoginAt ? dateTime(me.lastLoginAt) : "—"} />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Role, department, manager, and employment status can only be changed by HR / management.
          </p>
        </Card>

        <Card>
          <SectionTitle>My Performance</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Monthly Score" value={review ? Math.round(review.totalScore) : "—"} />
            <Field label="Grade" value={review?.finalGrade ? GRADE_LABEL[review.finalGrade] : "—"} />
            <Field label="Current Points" value={me.currentPoints.toLocaleString()} />
            <Field label="Lifetime Points" value={me.lifetimePoints.toLocaleString()} />
            <Field label="Growth Level" value={`Lv.${me.officialLevel} · ${growthLevelName(me.officialLevel)}`} />
            <Field label="Badges" value={badges.length} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {badges.map((b) => <span key={b.id} className="badge bg-slate-100 text-slate-600" title={b.badge.description}>{b.badge.icon} {b.badge.name}</span>)}
            {badges.length === 0 && <span className="text-xs text-ink-muted">No badges yet.</span>}
          </div>
        </Card>

        <Card>
          <SectionTitle>Edit My Profile</SectionTitle>
          <MyProfileForm phoneNumber={me.phoneNumber} avatarUrl={me.avatarUrl} />
        </Card>

        <Card>
          <SectionTitle action={<Link href="/rewards" className="text-xs font-semibold text-brand-600">Reward store →</Link>}>Reward History</SectionTitle>
          {redemptions.length === 0 ? (
            <p className="text-sm text-ink-muted">No redemptions yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {redemptions.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{r.reward.imageEmoji} {r.reward.name}</span>
                  <span className="text-xs text-ink-muted">{r.pointsSpent} pts · {r.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
