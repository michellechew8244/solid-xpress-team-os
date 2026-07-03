import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { dateTime, rm } from "@/lib/format";
import { PROPOSAL_CATEGORIES, PROPOSAL_STATUS_PILL } from "@/lib/proposals";
import { Avatar, Card, EmptyState, PageHeader, Pill, SectionTitle, StatCard } from "@/components/ui";
import { NewProposalForm, ProposalReviewButtons } from "@/components/ProposalControls";
import { suggestedAcceptReward } from "./actions";

export default async function ProposalsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const canFinal = isBoss(user.role) || user.role === "HR_ADMIN";
  const isReviewer = canFinal || user.role === "DEPARTMENT_HEAD";

  const [proposals, departments, submitters] = await Promise.all([
    prisma.proposal.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, name: true, avatarColor: true, departmentId: true } }),
  ]);
  const userOf = new Map(submitters.map((u) => [u.id, u]));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  // Staff see own + accepted/implemented (inspiration wall); reviewers see all
  // (dept heads scoped to their department's submitters + their own).
  const visible = proposals.filter((p) => {
    if (canFinal) return true;
    if (user.role === "DEPARTMENT_HEAD") return p.submittedById === user.id || userOf.get(p.submittedById)?.departmentId === user.departmentId || ["ACCEPTED", "IMPLEMENTED"].includes(p.status);
    return p.submittedById === user.id || ["ACCEPTED", "IMPLEMENTED"].includes(p.status);
  });

  const acceptedCount = proposals.filter((p) => ["ACCEPTED", "IMPLEMENTED"].includes(p.status)).length;
  const pendingCount = proposals.filter((p) => ["SUBMITTED", "UNDER_REVIEW"].includes(p.status)).length;
  const totalAwarded = proposals.reduce((s, p) => s + p.diamondsAwarded, 0);

  // Mini leaderboard: accepted proposals per staff.
  const tally = new Map<string, number>();
  for (const p of proposals) if (["ACCEPTED", "IMPLEMENTED"].includes(p.status)) tally.set(p.submittedById, (tally.get(p.submittedById) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const suggestions = new Map<string, number>();
  for (const p of visible) suggestions.set(p.id, await suggestedAcceptReward(p.category, p.estimatedImpactValue));

  return (
    <>
      <PageHeader
        title="Idea Bank"
        subtitle="Submit ideas that improve Solid Xpress. Good proposals can earn diamonds."
        action={<NewProposalForm departments={departments} />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Ideas accepted" value={acceptedCount} icon="✅" rag="ok" />
        <StatCard label="Awaiting review" value={pendingCount} icon="👀" rag={pendingCount ? "warn" : "ok"} />
        <StatCard label="Diamonds awarded" value={totalAwarded.toLocaleString()} icon="💎" rag="neutral" />
      </div>

      {top.length > 0 && (
        <Card className="mb-6">
          <SectionTitle>🏆 Top Idea Contributors</SectionTitle>
          <div className="flex flex-wrap gap-3">
            {top.map(([uid, n], i) => {
              const u = userOf.get(uid);
              return (
                <div key={uid} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-bold text-amber-500">#{i + 1}</span>
                  <Avatar name={u?.name ?? "?"} color={u?.avatarColor} size={22} />
                  <span>{u?.name ?? "—"}</span>
                  <span className="badge bg-green-100 text-green-700">{n} accepted</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {visible.length === 0 ? (
        <EmptyState title="No ideas yet 💡" hint="Be the first — every improvement starts with one observation." />
      ) : (
        <div className="space-y-4">
          {visible.map((p) => {
            const u = userOf.get(p.submittedById);
            return (
              <Card key={p.id} className={p.status === "IMPLEMENTED" ? "border-l-4 border-l-ok" : p.status === "ACCEPTED" ? "border-l-4 border-l-brand-400" : ""}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">{p.title}</span>
                      <span className="badge bg-slate-100 text-slate-600">{PROPOSAL_CATEGORIES[p.category] ?? p.category}</span>
                      <Pill value={PROPOSAL_STATUS_PILL[p.status] ?? "WARN"} label={p.status.replace(/_/g, " ")} />
                      {p.diamondsAwarded > 0 && <span className="badge bg-green-100 text-green-700">💎 +{p.diamondsAwarded}</span>}
                    </div>
                    <p className="mt-1 text-xs text-ink-soft"><strong>Problem:</strong> {p.problemObserved}</p>
                    <p className="text-xs text-ink-soft"><strong>Solution:</strong> {p.proposedSolution}</p>
                    {p.expectedBenefit && <p className="text-xs text-ink-muted"><strong>Benefit:</strong> {p.expectedBenefit}</p>}
                    <p className="mt-1 text-xs text-ink-muted">
                      {p.estimatedImpactValue > 0 && <>Est. impact {rm(p.estimatedImpactValue)} · </>}
                      {p.impactedDepartmentId ? deptName.get(p.impactedDepartmentId) : "Whole company"}
                      {p.attachmentUrl && <a href={p.attachmentUrl} target="_blank" rel="noreferrer" className="ml-1 text-brand-600 hover:underline">📎 attachment</a>}
                    </p>
                    {p.reviewerComment && <p className="mt-1 text-xs italic text-ink-muted">“{p.reviewerComment}”</p>}
                    <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                      <Avatar name={u?.name ?? "?"} color={u?.avatarColor} size={16} /> {u?.name ?? "—"} · {dateTime(p.createdAt)}
                    </div>
                  </div>
                  {isReviewer && (
                    <ProposalReviewButtons
                      proposalId={p.id} status={p.status}
                      canFinal={canFinal} canImplement={isBoss(user.role)}
                      suggested={suggestions.get(p.id) ?? 100}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
