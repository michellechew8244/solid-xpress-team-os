import { prisma } from "./prisma";
import { klNow } from "./attendance";

/**
 * Mission engine — progress is COMPUTED from real records for the current
 * period (nothing self-reported), and rewards are claimable exactly once per
 * mission per period (DB-unique MissionClaim). KL-timezone period windows.
 */

export const MISSION_CATEGORIES: Record<string, string> = {
  ATTENDANCE: "⏰ On-time attendance days",
  DAILY_REPORT: "📝 Daily reports filed",
  TASK: "✅ Tasks completed",
  PROPOSAL: "💡 Proposals submitted",
  TRAINING: "🎓 Trainings passed",
  BADGE: "🏅 Badges earned",
};

export const MISSION_TYPES: Record<string, string> = {
  DAILY: "Daily mission",
  WEEKLY: "Weekly quest",
  MONTHLY: "Monthly challenge",
};

/** ISO-week key like "2026-W27" for a KL date key. */
export function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Current period key + KL-anchored UTC window for a mission type. */
export function currentWindow(missionType: string): { periodKey: string; from: Date; to: Date; fromDate: string; toDate: string } {
  const { dateStr, period } = klNow();
  const at = (day: string, hm: string) => new Date(`${day}T${hm}+08:00`);
  const addDays = (day: string, n: number) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  if (missionType === "DAILY") {
    return { periodKey: dateStr, from: at(dateStr, "00:00:00"), to: at(dateStr, "23:59:59"), fromDate: dateStr, toDate: dateStr };
  }
  if (missionType === "WEEKLY") {
    const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay() || 7; // Mon=1
    const monday = addDays(dateStr, -(dow - 1));
    const sunday = addDays(monday, 6);
    return { periodKey: isoWeekKey(dateStr), from: at(monday, "00:00:00"), to: at(sunday, "23:59:59"), fromDate: monday, toDate: sunday };
  }
  const first = `${period}-01`;
  const nextMonth = addDays(`${period}-28`, 5).slice(0, 7);
  const last = addDays(`${nextMonth}-01`, -1);
  return { periodKey: period, from: at(first, "00:00:00"), to: at(last, "23:59:59"), fromDate: first, toDate: last };
}

/** Live progress for a user on a mission category within a window. */
export async function missionProgress(userId: string, category: string, w: { from: Date; to: Date; fromDate: string; toDate: string }): Promise<number> {
  switch (category) {
    case "ATTENDANCE":
      return prisma.attendanceRecord.count({ where: { userId, date: { gte: w.fromDate, lte: w.toDate }, clockIn: { not: null }, lateMinutes: 0, status: { notIn: ["MISSING_CHECK_OUT", "ABSENT"] } } });
    case "DAILY_REPORT":
      return prisma.dailyReport.count({ where: { userId, createdAt: { gte: w.from, lte: w.to } } });
    case "TASK":
      return prisma.task.count({ where: { assigneeId: userId, status: "COMPLETED", updatedAt: { gte: w.from, lte: w.to } } });
    case "PROPOSAL":
      return prisma.proposal.count({ where: { submittedById: userId, createdAt: { gte: w.from, lte: w.to } } });
    case "TRAINING":
      return prisma.trainingCompletion.count({ where: { userId, passed: true, completedAt: { gte: w.from, lte: w.to } } });
    case "BADGE":
      return prisma.userBadge.count({ where: { userId, awardedAt: { gte: w.from, lte: w.to } } });
    default:
      return 0;
  }
}

/** Starter mission set seeded by Boss/HR (idempotent-by-emptiness). */
export const STARTER_MISSIONS = [
  { title: "On-time check-in", description: "Check in on time today.", missionType: "DAILY", category: "ATTENDANCE", targetValue: 1, diamondReward: 5 },
  { title: "File today's report", description: "Submit your daily report.", missionType: "DAILY", category: "DAILY_REPORT", targetValue: 1, diamondReward: 5 },
  { title: "Close a task", description: "Complete one assigned task today.", missionType: "DAILY", category: "TASK", targetValue: 1, diamondReward: 10 },
  { title: "Perfect week", description: "5 on-time attendance days this week.", missionType: "WEEKLY", category: "ATTENDANCE", targetValue: 5, diamondReward: 30 },
  { title: "Reporting rhythm", description: "File 5 daily reports this week.", missionType: "WEEKLY", category: "DAILY_REPORT", targetValue: 5, diamondReward: 30 },
  { title: "Idea spark", description: "Submit 1 improvement proposal this week.", missionType: "WEEKLY", category: "PROPOSAL", targetValue: 1, diamondReward: 50 },
  { title: "Task machine", description: "Complete 10 tasks this month.", missionType: "MONTHLY", category: "TASK", targetValue: 10, diamondReward: 100, luckyDrawEntries: 1 },
  { title: "Always on time", description: "20 on-time days this month.", missionType: "MONTHLY", category: "ATTENDANCE", targetValue: 20, diamondReward: 150, luckyDrawEntries: 1 },
  { title: "Level up your skills", description: "Pass 2 trainings this month.", missionType: "MONTHLY", category: "TRAINING", targetValue: 2, diamondReward: 100 },
] as const;
