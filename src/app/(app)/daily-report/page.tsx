import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { DailyReportForm } from "@/components/DailyReportForm";
import { AiPanel } from "@/components/AiPanel";
import { requireFeature } from "@/lib/features";

export default async function DailyReportPage() {
  await requireFeature("daily-report");
  const user = await getCurrentUser();
  if (!user) return null;

  const reports = await prisma.dailyReport.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 10,
  });

  return (
    <>
      <PageHeader title="Daily Report" subtitle="Daily check-in — keeps the team pulse visible" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <SectionTitle>Today&apos;s Check-In</SectionTitle>
            <DailyReportForm />
          </Card>

          <Card>
            <SectionTitle>My Recent Reports</SectionTitle>
            <div className="space-y-3">
              {reports.length === 0 && <p className="text-sm text-ink-muted">No reports yet.</p>}
              {reports.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                    <span>{dateTime(r.date)}</span>
                    <span>⚡{r.energyLevel}/5 · 💪{r.confidenceLevel}/5</span>
                  </div>
                  <p className="text-sm text-ink-soft"><strong>Done:</strong> {r.completed}</p>
                  {r.pending && <p className="text-sm text-ink-soft"><strong>Pending:</strong> {r.pending}</p>}
                  {r.needHelp && <p className="text-sm text-amber-700"><strong>Needs help:</strong> {r.needHelp}</p>}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <AiPanel
            scope="daily-report"
            title="AI: Polish My Report"
            context={{ completed: "today's work", note: "Convert my notes into a professional summary" }}
          />
        </div>
      </div>
    </>
  );
}
