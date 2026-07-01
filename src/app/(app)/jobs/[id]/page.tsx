import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/rbac";
import { rm, shortDate } from "@/lib/format";
import { Card, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { MilestoneToggle } from "@/components/MilestoneToggle";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: true,
      milestones: { orderBy: { order: "asc" } },
      tasks: { include: { assignee: true } },
      finance: true,
    },
  });
  if (!job) notFound();

  const fields: [string, React.ReactNode][] = [
    ["Direction / Mode", `${job.direction} · ${job.mode}`],
    ["Customer", job.customer?.name ?? "—"],
    ["Shipper", job.shipper ?? "—"],
    ["Consignee", job.consignee ?? "—"],
    ["POL → POD", `${job.pol ?? "—"} → ${job.pod ?? "—"}`],
    ["Vessel / Voyage", job.vesselName ? `${job.vesselName} ${job.voyage ?? ""}` : job.flightDetails ?? "—"],
    ["ETD / ETA", `${shortDate(job.etd)} → ${shortDate(job.eta)}`],
    ["Closing / Arrival", `${shortDate(job.closingDate)} / ${shortDate(job.arrivalDate)}`],
    ["Container", job.containerNumber ?? "—"],
    ["Quantity", job.quantity ?? "—"],
    ["Goods", job.goodsDescription ?? "—"],
    ["Service", job.serviceRequired ?? "—"],
    ["Permit required", job.permitRequired ? "Yes" : "No"],
    ["Customs form", job.customsFormType ?? "—"],
  ];

  return (
    <>
      <Link href="/jobs" className="text-sm text-brand-600">← Back to Job Board</Link>
      <PageHeader
        title={job.jobNumber}
        subtitle={`${job.customer?.name ?? ""} · ${job.mode} ${job.direction}`}
        action={<div className="flex gap-2"><Pill value={job.billingStatus === "BILLED" ? "OK" : "WARN"} label={`Billing: ${job.billingStatus}`} /><Pill value={job.collectionStatus === "COLLECTED" ? "OK" : "WARN"} label={`Collection: ${job.collectionStatus}`} /></div>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <SectionTitle>Job Details</SectionTitle>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {fields.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-slate-50 py-1 text-sm">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="text-right font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <SectionTitle>Linked Missions</SectionTitle>
            {job.tasks.length === 0 && <p className="text-sm text-ink-muted">No tasks linked to this job.</p>}
            <div className="divide-y divide-slate-100">
              {job.tasks.map((t) => (
                <Link key={t.id} href={`/missions/${t.id}`} className="flex items-center justify-between py-2 hover:bg-slate-50">
                  <span className="text-sm font-medium">{t.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">{t.assignee?.name}</span>
                    <Pill value={t.status} />
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {canViewFinance(user.role) && job.finance && (
            <Card>
              <SectionTitle>Finance (restricted)</SectionTitle>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-lg font-bold">{rm(job.finance.sellingPrice)}</div><div className="text-xs text-ink-muted">Selling</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-lg font-bold">{rm(job.finance.cost)}</div><div className="text-xs text-ink-muted">Cost</div></div>
                <div className="rounded-lg bg-green-50 p-3"><div className="text-lg font-bold text-ok">{rm(job.finance.grossProfit)}</div><div className="text-xs text-ink-muted">Gross Profit</div></div>
              </div>
              {job.finance.shortBilling && <div className="mt-3 rounded bg-rose-50 p-2 text-xs text-rose-700">⚠️ Short billing flagged on this job.</div>}
            </Card>
          )}
        </div>

        <div>
          <Card>
            <SectionTitle>Shipment Milestones</SectionTitle>
            <div className="divide-y divide-slate-50">
              {job.milestones.map((m) => (
                <MilestoneToggle key={m.id} id={m.id} jobId={job.id} label={m.label} done={m.done} doneAt={m.doneAt ? shortDate(m.doneAt) : null} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
