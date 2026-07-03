import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { klHM } from "@/lib/attendance";
import { Card, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { CorrectionRequestForm, CorrectionReviewButtons } from "@/components/AttendanceCorrectionControls";

const PILL: Record<string, string> = { PENDING: "WARN", APPROVED: "OK", REJECTED: "DANGER" };

export default async function AttendanceCorrectionPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const reviewer = isBoss(user.role) || user.role === "HR_ADMIN";

  const [requests, names] = await Promise.all([
    prisma.attendanceCorrectionRequest.findMany({
      where: reviewer ? {} : { userId: user.id },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const fmt = (d: Date | null) => (d ? klHM(d) : "—");

  return (
    <>
      <PageHeader title="Attendance Correction" subtitle="Request a fix for a missed or wrong attendance record. Original server timestamps are never changed." />

      <Card className="mb-6">
        <SectionTitle>Submit a request</SectionTitle>
        <CorrectionRequestForm />
      </Card>

      <Card className="p-0">
        <div className="p-5 pb-2"><SectionTitle>{reviewer ? "All requests" : "My requests"} ({requests.length})</SectionTitle></div>
        <div className="divide-y divide-slate-100">
          {requests.length === 0 && <p className="p-5 text-sm text-ink-muted">No correction requests.</p>}
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-ink">{r.date} · {r.requestType.replace(/_/g, " ")} {reviewer && <span className="font-normal text-ink-muted">· {nameOf.get(r.userId) ?? "—"}</span>}</div>
                <div className="text-xs text-ink-muted">{r.reason}</div>
                <div className="text-xs text-ink-muted">
                  Original: {fmt(r.originalCheckInAt)} → {fmt(r.originalCheckOutAt)} · Requested: {fmt(r.requestedCheckInAt)} → {fmt(r.requestedCheckOutAt)}
                  {r.evidenceUrl && <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="ml-1 text-brand-600 hover:underline">📎 evidence</a>}
                </div>
                {r.reviewerComment && <div className="text-xs italic text-ink-muted">Reviewer: “{r.reviewerComment}”</div>}
                <div className="text-[10px] text-ink-muted">{dateTime(r.createdAt)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Pill value={PILL[r.status] ?? "WARN"} label={r.status} />
                {reviewer && r.status === "PENDING" && <CorrectionReviewButtons requestId={r.id} />}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
