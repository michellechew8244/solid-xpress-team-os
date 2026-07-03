import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { requireFeature } from "@/lib/features";
import { Avatar, Card, EmptyState, PageHeader, Pill, Progress, SectionTitle, StatCard } from "@/components/ui";
import { UploadWorkReportForm, ProgressUpdater, DeleteReportButton } from "@/components/WorkReportControls";

const TYPE_LABEL: Record<string, string> = {
  JOB_REPORT: "📦 Job report", STATUS_REPORT: "📋 Status report", PROGRESS_UPDATE: "📈 Progress update", OTHER: "🗂️ Other",
};

function fileIcon(mime: string, name: string) {
  const n = name.toLowerCase();
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv" || /\.(xlsx?|csv)$/.test(n)) return "📊";
  if (mime.includes("word") || /\.(docx?)$/.test(n)) return "📝";
  if (mime === "application/pdf" || n.endsWith(".pdf")) return "📕";
  return "📄";
}

function mb(n: number) {
  return n > 0 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : "";
}

export default async function WorkReportsPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  await requireFeature("work-reports");
  const user = await getCurrentUser();
  if (!user) return null;
  const manager = isBoss(user.role) || user.role === "HR_ADMIN" || user.role === "DEPARTMENT_HEAD";
  const sp = await searchParams;

  const deptScope = isBoss(user.role) || user.role === "HR_ADMIN" ? {} : { departmentId: user.departmentId ?? "" };
  const [myReports, teamReports, jobs, staffList] = await Promise.all([
    prisma.workReport.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 50 }),
    manager
      ? prisma.workReport.findMany({
          where: { user: { ...deptScope }, ...(sp.staff ? { userId: sp.staff } : {}) },
          include: { user: { select: { name: true, avatarColor: true } } },
          orderBy: { updatedAt: "desc" }, take: 100,
        })
      : Promise.resolve([]),
    prisma.job.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, jobNumber: true } }),
    manager
      ? prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true, ...deptScope }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const jobNo = new Map(jobs.map((j) => [j.id, j.jobNumber]));

  const inProgress = myReports.filter((r) => r.status === "IN_PROGRESS").length;
  const completed = myReports.filter((r) => r.status === "COMPLETED").length;
  const avg = myReports.length ? Math.round(myReports.reduce((s, r) => s + r.progressPct, 0) / myReports.length) : 0;

  return (
    <>
      <PageHeader title="📄 Work Reports" subtitle="Drop your Excel/Word/PDF job & status reports — the system records them, tracks your progress and keeps your manager in the loop." />

      {/* My virtual dashboard */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My reports" value={myReports.length} icon="📄" rag="neutral" />
        <StatCard label="In progress" value={inProgress} icon="🔄" rag={inProgress ? "warn" : "ok"} />
        <StatCard label="Completed" value={completed} icon="✅" rag="ok" />
        <StatCard label="Average progress" value={`${avg}%`} icon="📊" rag={avg >= 70 ? "ok" : avg >= 40 ? "warn" : "danger"} />
      </div>

      <Card className="mb-6">
        <SectionTitle>📤 Upload a report</SectionTitle>
        <UploadWorkReportForm jobs={jobs} />
      </Card>

      <Card className="mb-6 p-0">
        <div className="p-5 pb-2"><SectionTitle>My Reports ({myReports.length})</SectionTitle></div>
        <div className="divide-y divide-slate-100">
          {myReports.length === 0 && <EmptyState title="No reports yet" hint="Drag your first Excel/Word/PDF report into the box above." />}
          {myReports.map((r) => (
            <div key={r.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-lg">{fileIcon(r.fileType, r.fileName)}</span>
                    <span className="font-semibold text-ink">{r.title}</span>
                    <span className="badge bg-slate-100 text-slate-600">{TYPE_LABEL[r.reportType] ?? r.reportType}</span>
                    {r.jobId && <span className="badge bg-brand-50 text-brand-700">Job {jobNo.get(r.jobId) ?? "—"}</span>}
                    <Pill value={r.status === "COMPLETED" ? "OK" : "WARN"} label={r.status.replace(/_/g, " ")} />
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">📎 {r.fileName}</a>
                    {mb(r.fileSizeBytes) && ` · ${mb(r.fileSizeBytes)}`} · updated {dateTime(r.updatedAt)}
                    {r.progressNote && <span className="italic"> · “{r.progressNote}”</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-48"><Progress value={r.progressPct} rag={r.progressPct >= 100 ? "ok" : undefined} /></div>
                    <span className="text-xs font-bold text-brand-700">{r.progressPct}%</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <ProgressUpdater reportId={r.id} current={r.progressPct} />
                  <DeleteReportButton reportId={r.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Manager monitoring dashboard */}
      {manager && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-2">
            <SectionTitle>👥 Team Reports ({teamReports.length})</SectionTitle>
            <form method="get" className="flex items-center gap-2">
              <select name="staff" defaultValue={sp.staff ?? ""} className="input py-1 text-sm">
                <option value="">All staff</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn-ghost px-3 py-1 text-sm">Filter</button>
            </form>
          </div>
          <div className="divide-y divide-slate-100">
            {teamReports.length === 0 && <p className="p-5 text-sm text-ink-muted">No team reports yet.</p>}
            {teamReports.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar name={r.user.name} color={r.user.avatarColor} size={26} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{r.user.name} · {r.title}</div>
                    <div className="text-xs text-ink-muted">
                      <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{fileIcon(r.fileType, r.fileName)} {r.fileName}</a> · {dateTime(r.updatedAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-28"><Progress value={r.progressPct} rag={r.progressPct >= 100 ? "ok" : undefined} /></div>
                  <span className="w-10 text-right text-xs font-bold text-brand-700">{r.progressPct}%</span>
                  <Pill value={r.status === "COMPLETED" ? "OK" : "WARN"} label={r.status === "COMPLETED" ? "Done" : "WIP"} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
