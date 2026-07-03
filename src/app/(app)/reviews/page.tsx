import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss, canApproveTasks } from "@/lib/rbac";
import { GRADE_LABEL } from "@/lib/enums";
import type { Prisma } from "@prisma/client";
import { Avatar, Card, EmptyState, PageHeader, Progress } from "@/components/ui";
import { GenerateReviewsButton } from "@/components/GenerateReviewsButton";
import { requireFeature } from "@/lib/features";

const GRADE_COLOR: Record<string, string> = {
  A_PLUS: "bg-green-100 text-green-700", A: "bg-emerald-100 text-emerald-700",
  B: "bg-sky-100 text-sky-700", C: "bg-amber-100 text-amber-700",
  D: "bg-orange-100 text-orange-700", E: "bg-rose-100 text-rose-700",
};

export default async function ReviewsPage() {
  await requireFeature("reviews");
  const user = await getCurrentUser();
  if (!user) return null;
  const isManager = canApproveTasks(user.role) || user.role === "HR_ADMIN";

  const where: Prisma.PerformanceReviewWhereInput = {};
  if (!isBoss(user.role) && user.role !== "HR_ADMIN") {
    if (user.role === "DEPARTMENT_HEAD") where.staff = { departmentId: user.departmentId };
    else where.staffId = user.id;
  }

  const reviews = await prisma.performanceReview.findMany({
    where,
    include: { staff: { include: { department: true } }, manager: true },
    orderBy: [{ totalScore: "desc" }],
  });

  return (
    <>
      <PageHeader
        title="Performance Review"
        subtitle="Monthly grade = KPI 50% + Task 20% + Accuracy 15% + Teamwork 10% + Discipline 5%"
        action={isManager ? <GenerateReviewsButton /> : undefined}
      />

      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet" hint={isManager ? "Click 'Generate Reviews' to calculate from this month's data." : undefined} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reviews.map((r) => {
            const scores: [string, number][] = [
              ["KPI (50%)", r.kpiScore], ["Task (20%)", r.taskScore], ["Accuracy (15%)", r.accuracyScore],
              ["Teamwork (10%)", r.teamworkScore], ["Discipline (5%)", r.disciplineScore],
            ];
            return (
              <Card key={r.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.staff.name} color={r.staff.avatarColor} size={38} />
                    <div>
                      <div className="font-semibold text-ink">{r.staff.name}</div>
                      <div className="text-xs text-ink-muted">{r.staff.department?.name} · {r.period} · score {Math.round(r.totalScore)}</div>
                    </div>
                  </div>
                  <div className={`grid h-12 w-12 place-items-center rounded-full text-lg font-bold ${GRADE_COLOR[r.finalGrade ?? "C"]}`}>{GRADE_LABEL[r.finalGrade ?? "C"]}</div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {scores.map(([label, val]) => (
                    <div key={label} className="flex items-center gap-2 text-xs">
                      <span className="w-28 text-ink-muted">{label}</span>
                      <div className="flex-1"><Progress value={val} rag={val >= 80 ? "ok" : val >= 60 ? "warn" : "danger"} /></div>
                      <span className="w-8 text-right font-semibold">{Math.round(val)}</span>
                    </div>
                  ))}
                </div>
                {r.rewardRecommendation && r.rewardRecommendation !== "—" && <p className="mt-3 text-xs text-ok">🎁 {r.rewardRecommendation}</p>}
                {r.promotionRecommendation && r.promotionRecommendation !== "—" && <p className="text-xs text-ok">🚀 {r.promotionRecommendation}</p>}
                {r.improvementPlan && <p className="mt-1 text-xs text-ink-muted">📋 {r.improvementPlan}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
