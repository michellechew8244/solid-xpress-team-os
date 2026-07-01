import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { shortDate } from "@/lib/format";
import { Card, PageHeader, Pill } from "@/components/ui";

const MODE_ICON: Record<string, string> = {
  SEA: "🚢", AIR: "✈️", LAND: "🚚", FORWARDING: "📋", HAULAGE: "🚛", WAREHOUSE: "🏭", TRANSLOADING: "🔁", COURIER: "🏍️",
};

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const sp = await searchParams;
  const jobs = await prisma.job.findMany({
    where: sp.mode ? { mode: sp.mode } : {},
    include: { customer: true, milestones: true },
    orderBy: { createdAt: "desc" },
  });

  const modes = ["SEA", "AIR", "LAND", "FORWARDING", "HAULAGE"];

  return (
    <>
      <PageHeader title="Job Board" subtitle="Logistics jobs linked to tasks, KPI and finance" />

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip label="All modes" href="/jobs" active={!sp.mode} />
        {modes.map((m) => <Chip key={m} label={`${MODE_ICON[m]} ${m}`} href={`/jobs?mode=${m}`} active={sp.mode === m} />)}
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                <th className="px-4 py-3">Job</th>
                <th className="px-3">Customer</th>
                <th className="px-3">Route</th>
                <th className="px-3">ETA</th>
                <th className="px-3 w-40">Progress</th>
                <th className="px-3">Billing</th>
                <th className="px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((j) => {
                const done = j.milestones.filter((m) => m.done).length;
                const total = j.milestones.length || 1;
                const progress = Math.round((done / total) * 100);
                return (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${j.id}`} className="font-semibold text-brand-700">{j.jobNumber}</Link>
                      <div className="text-xs text-ink-muted">{MODE_ICON[j.mode]} {j.direction} · {j.mode}</div>
                    </td>
                    <td className="px-3">{j.customer?.name ?? "—"}</td>
                    <td className="px-3 text-xs text-ink-soft">{j.pol} → {j.pod}</td>
                    <td className="px-3 text-xs">{shortDate(j.eta)}</td>
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-500" style={{ width: `${progress}%` }} /></div>
                        <span className="text-xs text-ink-muted">{done}/{total}</span>
                      </div>
                    </td>
                    <td className="px-3"><Pill value={j.billingStatus === "BILLED" ? "OK" : "WARN"} label={j.billingStatus} /></td>
                    <td className="px-3"><Pill value={j.status === "CLOSED" ? "COMPLETED" : "IN_PROGRESS"} label={j.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return <Link href={href} className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-ink-soft hover:bg-slate-50"}`}>{label}</Link>;
}
