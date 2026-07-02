"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canApproveTasks } from "@/lib/rbac";
import { awardPoints, kpiPoints } from "@/lib/points";
import { notify } from "@/lib/notify";
import { currentPeriod } from "@/lib/enums";

/** Staff submits an actual value for one of their KPIs (current period). */
export async function submitKpiActual(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const kpiId = String(formData.get("kpiId") ?? "");
  const actual = Number(formData.get("actualValue") ?? 0);
  const evidenceUrl = String(formData.get("evidenceUrl") ?? "") || null;
  const kpi = await prisma.kPI.findUnique({ where: { id: kpiId } });
  if (!kpi) throw new Error("KPI not found");

  const period = currentPeriod();
  const achievementRate = kpi.targetValue > 0 ? (actual / kpi.targetValue) * 100 : 0;
  const points = kpiPoints(achievementRate, kpi.pointMultiplier, kpi.maxPoints);

  const existing = await prisma.kPIResult.findUnique({
    where: { kpiId_userId_period: { kpiId, userId: session.id, period } },
  });
  // Don't let a re-submission silently wipe already-credited points.
  if (existing?.credited) throw new Error("This KPI has already been reviewed and credited this period.");

  await prisma.kPIResult.upsert({
    where: { kpiId_userId_period: { kpiId, userId: session.id, period } },
    create: {
      kpiId, userId: session.id, period, actualValue: actual,
      achievementPct: Math.round(achievementRate), pointsAwarded: points,
      status: "SUBMITTED", evidenceUrl,
    },
    update: {
      actualValue: actual, achievementPct: Math.round(achievementRate),
      pointsAwarded: points, status: "SUBMITTED",
      // Keep the previously uploaded proof if this resubmission has none.
      evidenceUrl: evidenceUrl ?? existing?.evidenceUrl ?? null,
    },
  });

  // Notify the KPI reviewer/owner.
  const reviewerId = kpi.reviewerId ?? kpi.ownerId;
  if (reviewerId && reviewerId !== session.id) {
    await notify(prisma, { userId: reviewerId, type: "KPI_UPDATED", title: "KPI result submitted", body: `${session.name} submitted "${kpi.name}".`, link: "/kpi" });
  }
  revalidatePath("/kpi");
}

/** Manager reviews a submitted KPI result; approving credits the points. */
export async function reviewKpiResult(resultId: string, approve: boolean, comment?: string) {
  const session = await getSession();
  if (!session || !canApproveTasks(session.role)) throw new Error("Forbidden");

  const result = await prisma.kPIResult.findUnique({ where: { id: resultId }, include: { kpi: true } });
  if (!result) throw new Error("Not found");
  if (result.credited) return; // idempotent

  if (!approve) {
    await prisma.kPIResult.update({ where: { id: resultId }, data: { status: "REJECTED", reviewerId: session.id, reviewerComment: comment ?? null } });
    await notify(prisma, { userId: result.userId, type: "KPI_UPDATED", title: "KPI result needs revision", body: `${result.kpi.name}: ${comment ?? "please revise"}`, link: "/kpi" });
    revalidatePath("/kpi");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.kPIResult.update({ where: { id: resultId }, data: { status: "APPROVED", credited: true, reviewerId: session.id, reviewerComment: comment ?? null } });
    if (result.pointsAwarded > 0) {
      await awardPoints(tx, {
        userId: result.userId, amount: result.pointsAwarded, type: "KPI",
        reason: `KPI approved: ${result.kpi.name} (${result.achievementPct}%)`,
        refType: "KPI", refId: result.kpiId,
      });
    }
    await notify(tx, { userId: result.userId, type: "POINTS_AWARDED", title: `KPI approved · +${result.pointsAwarded} pts`, body: result.kpi.name, link: "/wallet" });
  });
  revalidatePath("/kpi");
  revalidatePath("/wallet");
}
