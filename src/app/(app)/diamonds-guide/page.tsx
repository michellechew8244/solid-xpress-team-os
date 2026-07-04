import { getCurrentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { getRewardRuleSetting } from "@/lib/reward-rules";
import { getAttendanceSetting } from "@/lib/attendance";
import { getOnboardingSetting } from "@/lib/onboarding-bonus";
import { Card, PageHeader, SectionTitle } from "@/components/ui";

function Rule({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-ink"><span className="mr-1">{icon}</span>{label}</span>
      <span className="shrink-0 font-semibold text-brand-700">{value}</span>
    </div>
  );
}

export default async function DiamondsGuidePage() {
  await requireFeature("diamond-guide");
  const user = await getCurrentUser();
  if (!user) return null;

  const [rules, att, onboarding] = await Promise.all([getRewardRuleSetting(), getAttendanceSetting(), getOnboardingSetting()]);
  const d = (n: number) => `+${n} 💎`;

  return (
    <>
      <PageHeader title="💎 How Diamonds Are Earned" subtitle="Every way to earn (and lose) diamonds at Solid Xpress — current company rules." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>📈 KPI Performance</SectionTitle>
          <p className="text-sm text-ink-muted">Diamonds = <strong>achievement % × multiplier</strong>, capped at each KPI&apos;s maximum. Credited once your manager approves your submission.</p>
          <p className="mt-2 text-xs text-ink-muted">Example: hitting 120% of target on a KPI with a ×2 multiplier = 240 💎 (or the KPI&apos;s cap, whichever is lower).</p>
        </Card>

        <Card>
          <SectionTitle>⏰ Attendance</SectionTitle>
          {att.diamondRewardEnabled ? (
            <>
              <Rule icon="✅" label="Check in on time" value={d(att.onTimeDiamondReward)} />
              <Rule icon="📘" label="Complete a full day (in + out)" value={d(att.completeDayDiamondReward)} />
              <Rule icon="🔥" label="5 on-time working days in a row" value={d(att.weeklyStreakDiamondReward)} />
              <Rule icon="🏆" label="Perfect attendance for the month" value={d(att.monthlyPerfectAttendanceReward)} />
              {att.lateDeductionEnabled && <Rule icon="⏰" label="Late check-in" value={`−${att.lateDeductionDiamond} 💎`} />}
              {att.lateDeductionEnabled && <Rule icon="🚫" label="Missing check-out" value={`−${att.missingCheckoutDeductionDiamond} 💎`} />}
            </>
          ) : <p className="text-sm text-ink-muted">Attendance diamond rewards are currently turned off.</p>}
          <p className="mt-2 text-[11px] text-ink-muted">Approved leave, outstation, customer visits, port duty and remote work are never penalised.</p>
        </Card>

        <Card>
          <SectionTitle>🎮 Check-in Games</SectionTitle>
          {rules.streakEnabled && (
            <>
              <Rule icon="🔥" label="3-day check-in streak" value={d(rules.streakDay3)} />
              <Rule icon="🔥" label="7-day check-in streak" value={d(rules.streakDay7)} />
              <Rule icon="🔥" label="14-day check-in streak" value={d(rules.streakDay14)} />
              <Rule icon="🔥" label="30-day check-in streak" value={d(rules.streakDay30)} />
            </>
          )}
          {rules.dailySpinEnabled && <Rule icon="🎡" label="Daily check-in spin" value={`${rules.spinPrizeCommon}–${rules.spinPrizeJackpot} 💎`} />}
          <Rule icon="🎯" label="Missions & quests (daily/weekly/monthly)" value="varies" />
          <Rule icon="🏅" label="Badges earned" value="bonus 💎" />
        </Card>

        <Card>
          <SectionTitle>💡 Ideas & Competition</SectionTitle>
          <Rule icon="💡" label="Proposal accepted by company" value={d(rules.proposalAcceptedReward) + " (base)"} />
          <Rule icon="🚀" label="Proposal implemented" value={d(rules.proposalImplementedReward)} />
          <Rule icon="⚔️" label="PK Arena — 1st / 2nd / 3rd place" value="+300 / +200 / +100 💎" />
          <Rule icon="🏢" label="Winning department (per member)" value="team bonus 💎" />
        </Card>

        <Card>
          <SectionTitle>🎁 Recognition & One-offs</SectionTitle>
          {onboarding.enabled && <Rule icon="🆕" label="New-staff welcome bonus" value={d(onboarding.amount)} />}
          <Rule icon="🎁" label="Owner Mystery Bonus" value="surprise 💎" />
          <Rule icon="🌳" label="Wishing Tree — win your staked challenge" value="stake ×2 💎" />
          <Rule icon="✅" label="Completing tasks, training, teamwork" value="bonus 💎" />
        </Card>

        <Card>
          <SectionTitle>🛍️ Spending Diamonds</SectionTitle>
          <Rule icon="🎁" label="Reward Store redemptions" value="spend 💎" />
          <Rule icon="🎰" label="Lucky Draw entries" value="spend / earn 💎" />
          <Rule icon="🌳" label="Stake on a Wishing Tree challenge" value="risk 💎" />
          <p className="mt-2 text-[11px] text-ink-muted">Every diamond movement is recorded in your Diamond Wallet with a reason — nothing is hidden.</p>
        </Card>
      </div>
    </>
  );
}
