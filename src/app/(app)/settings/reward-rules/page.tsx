import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { getRewardRuleSetting } from "@/lib/reward-rules";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { RewardRulesForm } from "@/components/RewardRulesForm";

const LINKED: { href: string; icon: string; label: string; desc: string }[] = [
  { href: "/attendance/settings", icon: "⏰", label: "Attendance rewards", desc: "On-time, complete-day, perfect-month rewards & late/missing deductions" },
  { href: "/points-admin", icon: "💎", label: "Onboarding welcome bonus", desc: "New-staff joining diamonds (amount, timing, enable)" },
  { href: "/settings/diamond-authority", icon: "🔐", label: "Diamond Authority & budgets", desc: "Who can generate diamonds, proposal caps, monthly budget" },
  { href: "/missions-hub", icon: "🎮", label: "Missions & quests", desc: "Per-mission diamond rewards and lucky-draw entries" },
  { href: "/pk-arena/campaigns", icon: "⚔️", label: "PK campaign prizes", desc: "1st/2nd/3rd & team rewards per competition" },
];

export default async function RewardRulesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!isBoss(user.role)) redirect("/dashboard");
  const rules = await getRewardRuleSetting();

  return (
    <>
      <PageHeader title="🎯 Reward Rules Centre" subtitle="Set the diamond rewards for every earning feature in one place." />

      <Card className="mb-6">
        <SectionTitle>Streaks · Daily Spin · Proposals</SectionTitle>
        <RewardRulesForm rules={rules} />
      </Card>

      <Card>
        <SectionTitle>Other reward settings</SectionTitle>
        <p className="mb-3 -mt-1 text-xs text-ink-muted">These reward rules live with their own module — open them here.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {LINKED.map((l) => (
            <Link key={l.href} href={l.href} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <span className="text-xl">{l.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-ink">{l.label}</span>
                <span className="block text-xs text-ink-muted">{l.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
