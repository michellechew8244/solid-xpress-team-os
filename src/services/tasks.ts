import { prisma } from "@/lib/prisma";

/**
 * Mark past-deadline, unfinished tasks as OVERDUE (section D automation).
 * Idempotent — safe to call on every relevant page load. Auto point-deduction
 * is intentionally left as a future cron hook to avoid repeated deductions.
 */
export async function sweepOverdue() {
  await prisma.task.updateMany({
    where: {
      deadline: { lt: new Date() },
      status: { in: ["NOT_STARTED", "IN_PROGRESS", "WAITING_EXTERNAL"] },
    },
    data: { status: "OVERDUE" },
  });
}
