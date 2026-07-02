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

/** Recompute the denormalised StaffProfile counters from the attendance ledger. */
export async function recomputeAttendanceCounters(userId: string) {
  const rows = await prisma.attendanceRecord.groupBy({ by: ["status"], where: { userId }, _count: true });
  const count = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  await prisma.staffProfile.updateMany({
    where: { userId },
    data: { daysPresent: count("PRESENT"), daysLate: count("LATE"), daysAbsent: count("ABSENT") },
  });
}
