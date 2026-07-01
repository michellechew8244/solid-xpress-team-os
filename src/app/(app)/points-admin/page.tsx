import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canApproveTasks, isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { dateTime } from "@/lib/format";
import { Avatar, Card, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { PenaltyForm, RecognitionForm, AdjustForm } from "@/components/PointsAdminForms";
import { LeaveBlockToggles } from "@/components/LeaveBlockToggles";
import { OnboardingBonusSettingForm } from "@/components/OnboardingBonusSettingForm";
import { getOnboardingSetting } from "@/lib/onboarding-bonus";

export default async function PointsAdminPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const isManager = canApproveTasks(user.role) || user.role === "HR_ADMIN";
  if (!isManager) redirect("/dashboard");

  const period = currentPeriod();
  const deptScope = isBoss(user.role) || user.role === "HR_ADMIN" ? {} : { departmentId: user.departmentId ?? "" };

  const [staff, rules, recentTx, redLines, settings, onboardingSetting] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, ...deptScope }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.penaltyRule.findMany({ where: { isActive: true }, orderBy: { deductionPoints: "asc" } }),
    prisma.pointsTransaction.findMany({
      where: { period, type: { in: ["PENALTY", "MANUAL", "TEAMWORK", "COMPLIMENT", "COST_SAVING", "PROBLEM_SOLVED", "SOP", "MENTORING"] }, user: deptScope },
      include: { user: true }, orderBy: { createdAt: "desc" }, take: 25,
    }),
    prisma.coachingRecord.findMany({ where: { triggeredBy: "RED_LINE" }, include: { staff: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.systemSetting.findMany(),
    getOnboardingSetting(),
  ]);
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.enabled]));
  const canToggleLeave = isBoss(user.role) || user.role === "HR_ADMIN";
  // Onboarding bonus settings are visible to Boss/HR; only the Owner can edit.
  const canSeeOnboardingSetting = isBoss(user.role) || user.role === "HR_ADMIN";

  const totalIssued = recentTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalDeducted = recentTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <>
      <PageHeader title="Diamond Admin" subtitle="Apply penalties, award recognition, and adjust diamonds (with approval)" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-ok"><div className="text-xs uppercase text-ink-muted">Recognition issued (month)</div><div className="text-2xl font-bold text-ok">+{totalIssued}</div></Card>
        <Card className="border-l-4 border-l-danger"><div className="text-xs uppercase text-ink-muted">Diamonds deducted (month)</div><div className="text-2xl font-bold text-danger">-{totalDeducted}</div></Card>
        <Card className="border-l-4 border-l-warn"><div className="text-xs uppercase text-ink-muted">Red-line cases</div><div className="text-2xl font-bold text-warn">{redLines.length}</div></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>⚖️ Apply Penalty</SectionTitle>
          <PenaltyForm staff={staff} rules={rules.map((r) => ({ id: r.id, name: r.name, deductionPoints: r.deductionPoints, severity: r.severity, isRedLine: r.isRedLine }))} />
        </Card>

        <Card>
          <SectionTitle>🌟 Award Special Contribution</SectionTitle>
          <RecognitionForm staff={staff} />
        </Card>
      </div>

      {canToggleLeave && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle>Manual Adjustment</SectionTitle>
            <AdjustForm staff={staff} />
          </Card>
          <Card>
            <SectionTitle>🔒 Leave Redemption Controls</SectionTitle>
            <LeaveBlockToggles enabled={settingsMap} />
          </Card>
        </div>
      )}

      {canSeeOnboardingSetting && (
        <Card className="mt-6">
          <SectionTitle>💎 New Staff Onboarding Bonus</SectionTitle>
          <p className="mb-3 -mt-1 text-xs text-ink-muted">Automatically reward every newly onboarded staff with welcome diamonds.</p>
          <OnboardingBonusSettingForm setting={onboardingSetting} canEdit={isBoss(user.role)} />
        </Card>
      )}

      {redLines.length > 0 && (
        <Card className="mt-6 border-l-4 border-l-danger">
          <SectionTitle>⛔ Red-Line Cases</SectionTitle>
          <div className="divide-y divide-slate-100">
            {redLines.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span><strong>{r.staff.name}</strong> — {r.issue}</span>
                <Pill value="DANGER" label={r.status} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-6 p-0">
        <div className="p-5 pb-2"><SectionTitle>Recent Diamond Activity</SectionTitle></div>
        <div className="divide-y divide-slate-100">
          {recentTx.length === 0 && <p className="p-5 text-sm text-ink-muted">No activity this month.</p>}
          {recentTx.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="flex items-center gap-2">
                <Avatar name={t.user.name} color={t.user.avatarColor} size={26} />
                <div>
                  <div className="text-sm font-medium text-ink">{t.user.name}</div>
                  <div className="text-xs text-ink-muted">{t.reason} · {dateTime(t.createdAt)}</div>
                </div>
              </div>
              <span className={`text-sm font-bold ${t.amount >= 0 ? "text-ok" : "text-danger"}`}>{t.amount >= 0 ? "+" : ""}{t.amount}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
