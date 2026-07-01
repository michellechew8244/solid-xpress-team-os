"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";

/**
 * Toggle a shipment milestone. When completed, we notify the boss-side feed and
 * keep job status roughly in sync. (Auto-generating department tasks per
 * milestone is a documented future hook — section E.)
 */
export async function toggleMilestone(milestoneId: string, jobId: string, done: boolean) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await prisma.jobMilestone.update({
    where: { id: milestoneId },
    data: { done, doneAt: done ? new Date() : null },
  });

  // Keep a couple of job summary flags in sync with key milestones.
  const m = await prisma.jobMilestone.findUnique({ where: { id: milestoneId } });
  if (m) {
    if (m.stage === "INVOICE_ISSUED") {
      await prisma.job.update({ where: { id: jobId }, data: { billingStatus: done ? "BILLED" : "UNBILLED" } });
    }
    if (m.stage === "PAYMENT_COLLECTED") {
      await prisma.job.update({ where: { id: jobId }, data: { collectionStatus: done ? "COLLECTED" : "PENDING" } });
    }
    if (m.stage === "JOB_CLOSED" && done) {
      await prisma.job.update({ where: { id: jobId }, data: { status: "CLOSED" } });
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}
