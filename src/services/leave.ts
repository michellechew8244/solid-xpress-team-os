import { prisma } from "@/lib/prisma";

/**
 * Leave-reward redemption guard (spec §C). Returns a human-readable reason if
 * the staff member may NOT redeem a leave reward right now, else null.
 * Blocks on:
 *  - company toggles: month-end closing, peak period, short-handed
 *  - an urgent or overdue pending task
 *  - an unresolved performance / coaching issue
 */
export async function leaveBlockReason(userId: string): Promise<string | null> {
  const [flags, overdue, urgent, coaching] = await Promise.all([
    prisma.systemSetting.findMany({ where: { enabled: true } }),
    prisma.task.findFirst({ where: { assigneeId: userId, status: "OVERDUE" } }),
    prisma.task.findFirst({ where: { assigneeId: userId, priority: "URGENT", status: { notIn: ["COMPLETED", "REJECTED"] } } }),
    prisma.coachingRecord.findFirst({ where: { staffId: userId, status: { not: "RESOLVED" } } }),
  ]);

  const flag = flags.find((f) => ["MONTH_END_CLOSING", "PEAK_PERIOD", "SHORT_HANDED"].includes(f.key));
  if (flag) return flag.label;
  if (overdue) return "You have an overdue task to clear first";
  if (urgent) return "You have an urgent pending task";
  if (coaching) return "You have an unresolved performance / coaching issue";
  return null;
}
