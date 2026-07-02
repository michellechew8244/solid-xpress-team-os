import { prisma } from "./prisma";

/**
 * Attendance helpers. All calendar logic runs in Asia/Kuala_Lumpur regardless
 * of server timezone (Vercel = UTC).
 */

export const LATE_AFTER_MINUTES = 9 * 60 + 15; // late if clock-in after 09:15

/** Current KL wall-clock: date key "YYYY-MM-DD", period "YYYY-MM", minutes since midnight. */
export function klNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    dateStr,
    period: dateStr.slice(0, 7),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Previous KL calendar day of a "YYYY-MM-DD" key. */
function prevDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Consecutive-day clock-in streak ending on `endDate` (inclusive). Weekends
 * are not skipped — the streak counts strictly consecutive calendar days,
 * which keeps the rule simple and transparent for staff.
 */
export async function computeStreak(userId: string, endDate: string): Promise<number> {
  const rows = await prisma.attendanceRecord.findMany({
    where: { userId, clockIn: { not: null } },
    select: { date: true },
    orderBy: { date: "desc" },
    take: 60,
  });
  const have = new Set(rows.map((r) => r.date));
  let streak = 0;
  let day = endDate;
  while (have.has(day)) {
    streak++;
    day = prevDay(day);
  }
  return streak;
}

/** Recompute the denormalised StaffProfile counters from the attendance ledger. */
export async function recomputeAttendanceCounters(userId: string) {
  const rows = await prisma.attendanceRecord.groupBy({ by: ["status"], where: { userId }, _count: true });
  const count = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  await prisma.staffProfile.updateMany({
    where: { userId },
    data: { daysPresent: count("PRESENT"), daysLate: count("LATE"), daysAbsent: count("ABSENT") },
  });
}
