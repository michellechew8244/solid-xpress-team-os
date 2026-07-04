import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { positionForUser, jobVolumeScore } from "@/lib/performance";
import { label } from "@/lib/job-types";
import { Card, PageHeader, SectionTitle, StatCard, Pill } from "@/components/ui";
import { LogJobForm, JobRowControls } from "@/components/JobHandlingControls";

export default async function JobHandlingPage({ searchParams }: { searchParams: Promise<{ period?: string; user?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const manager = isBoss(me.role) || me.role === "DEPARTMENT_HEAD" || me.role === "HR_ADMIN";

  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();

  // Managers see their scope; staff see themselves.
  const scopeUsers = manager
    ? await prisma.user.findMany({
        where: { isActive: true, NOT: { email: { endsWith: "@solidxpress.system" } }, ...(me.role === "DEPARTMENT_HEAD" && me.departmentId ? { departmentId: me.departmentId } : {}) },
        select: { id: true, name: true, departmentId: true }, orderBy: { name: "asc" },
      })
    : [{ id: me.id, name: me.name, departmentId: me.departmentId }];
  const focusUserId = manager && sp.user && scopeUsers.some((u) => u.id === sp.user) ? sp.user : null;

  const records = await prisma.jobHandlingRecord.findMany({
    where: { jobMonth: period, userId: focusUserId ? focusUserId : { in: scopeUsers.map((u) => u.id) } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const nameById = new Map(scopeUsers.map((u) => [u.id, u.name]));

  // My monthly progress vs my position target.
  const myPosition = await positionForUser(me.id);
  const myValid = records.filter((r) => r.userId === me.id && r.isValidForKPI && ["COMPLETED", "IN_PROGRESS"].includes(r.status)).length;
  const myTarget = myPosition?.minJobTarget ?? 0;
  const myVolumeScore = myTarget > 0 ? jobVolumeScore(myValid, myTarget, myPosition!.zeroBandBelow, myPosition!.cap110At, myPosition!.volumeCapPct) : null;

  // Per-staff summary for managers.
  const summary = manager
    ? scopeUsers.map((u) => {
        const mine = records.filter((r) => r.userId === u.id);
        const valid = mine.filter((r) => r.isValidForKPI && ["COMPLETED", "IN_PROGRESS"].includes(r.status)).length;
        const errors = mine.reduce((s, r) => s + r.errorCount, 0);
        return { ...u, total: mine.length, valid, errors };
      }).filter((x) => x.total > 0 || focusUserId === x.id)
    : [];

  return (
    <>
      <PageHeader title="📦 Job Handling Records" subtitle={`Valid completed/handled jobs count toward your monthly KPI target · ${period}`} />

      <form className="mb-4 flex items-center gap-2" action="/jobs/handling-records" method="get">
        <input type="month" name="period" defaultValue={period} className="input w-44" />
        <button className="btn-ghost">View month</button>
      </form>

      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Valid Jobs" value={myTarget ? `${myValid} / ${myTarget}` : myValid} icon="📦" rag={myTarget === 0 || myValid >= myTarget ? "ok" : "warn"} />
        {myVolumeScore !== null && <StatCard label="My Volume Score" value={`${Math.round(myVolumeScore)}%`} icon="🎯" rag={myVolumeScore >= 100 ? "ok" : myVolumeScore > 0 ? "warn" : "danger"} />}
        <StatCard label="Records This Month" value={records.length} icon="🗂️" rag="neutral" />
        {myPosition && <StatCard label="My Position" value={myPosition.name} icon="👤" rag="neutral" />}
      </div>

      <Card className="mb-5">
        <SectionTitle>Log a handled job</SectionTitle>
        <p className="mb-2 text-xs text-ink-muted">Only valid, genuinely handled jobs count. Duplicates are blocked; cancelled/test records are excluded by managers.</p>
        <LogJobForm people={manager ? scopeUsers.map((u) => ({ id: u.id, name: u.name })) : []} defaultMonth={period} />
      </Card>

      {manager && summary.length > 0 && (
        <Card className="mb-5">
          <SectionTitle>Staff job counts — {period}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {summary.map((u) => (
              <a key={u.id} href={`/jobs/handling-records?period=${period}&user=${u.id}`} className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <div className="font-semibold text-ink">{u.name}</div>
                <div className="text-xs text-ink-muted">{u.valid} valid / {u.total} logged{u.errors ? ` · ${u.errors} errors` : ""}</div>
              </a>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                <th className="px-4 py-3">Job No</th><th className="px-3">Staff</th><th className="px-3">Type</th>
                <th className="px-3">Customer</th><th className="px-3">Status</th><th className="px-3">KPI</th><th className="px-3">Quality</th><th className="px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{r.jobNo}</td>
                  <td className="px-3 text-xs">{nameById.get(r.userId) ?? "—"}</td>
                  <td className="px-3 text-xs">{label(r.jobType)}</td>
                  <td className="px-3 text-xs text-ink-muted">{r.customerName ?? "—"}</td>
                  <td className="px-3"><Pill value={r.status === "COMPLETED" ? "COMPLETED" : r.status === "IN_PROGRESS" ? "IN_PROGRESS" : r.status === "CANCELLED" ? "REJECTED" : "WAITING_EXTERNAL"} label={r.status.replace(/_/g, " ")} /></td>
                  <td className="px-3">{r.isValidForKPI ? <span className="badge bg-green-100 text-green-700">counts</span> : <span className="badge bg-slate-200 text-slate-600">excluded</span>}</td>
                  <td className="px-3 text-xs">{r.qualityScore}{r.errorCount ? <span className="text-danger"> · {r.errorCount} err</span> : ""}</td>
                  <td className="px-3">
                    <JobRowControls id={r.id} status={r.status} isValid={r.isValidForKPI} quality={r.qualityScore} errors={r.errorCount} manager={manager} />
                  </td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-ink-muted">No job records for {period} yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
