import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { shortDate } from "@/lib/format";
import { PK_METRICS } from "@/lib/pk";
import { Card, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { NewPKCampaignForm, PKCampaignAdminButtons } from "@/components/PKControls";
import { requireFeature } from "@/lib/features";

const PILL: Record<string, string> = { ACTIVE: "OK", UPCOMING: "WARN", COMPLETED: "COMPLETED", CANCELLED: "DANGER" };

export default async function PKCampaignsPage() {
  await requireFeature("pk-campaigns");
  const user = await getCurrentUser();
  if (!user) return null;

  const campaigns = await prisma.pKCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <>
      <PageHeader title="PK Campaigns" subtitle="Create, monitor and finalize competitions." action={<NewPKCampaignForm metrics={PK_METRICS} />} />

      <Card className="p-0">
        <div className="p-5 pb-2"><SectionTitle>All campaigns ({campaigns.length})</SectionTitle></div>
        <div className="divide-y divide-slate-100">
          {campaigns.length === 0 && <p className="p-5 text-sm text-ink-muted">No campaigns yet — launch the first PK!</p>}
          {campaigns.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{c.pkType === "DEPARTMENT" ? "🏢" : "🧍"} {c.title}</span>
                  <Pill value={PILL[c.status] ?? "WARN"} label={c.status} />
                </div>
                <div className="text-xs text-ink-muted">
                  {PK_METRICS[c.metricType] ?? c.metricType} · {shortDate(c.startDate)} → {shortDate(c.endDate)} · 🥇{c.rewardFirstPlace} 🥈{c.rewardSecondPlace} 🥉{c.rewardThirdPlace}{c.pkType === "DEPARTMENT" ? ` · team ${c.teamReward}/member` : ""}
                </div>
              </div>
              <PKCampaignAdminButtons campaignId={c.id} status={c.status} canFinalize={isBoss(user.role)} />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
