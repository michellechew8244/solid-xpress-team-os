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
    data: { daysPresent: count("PRESENT") + count("COMPLETED") + count("EARLY_LEAVE"), daysLate: count("LATE"), daysAbsent: count("ABSENT") },
  });
}

// ===========================================================================
// Attendance Centre (Module 1) — settings, working-day math, diamond rules.
// ===========================================================================

import { awardPoints } from "./points";
import { logAudit } from "./audit";
import { notify } from "./notify";

/** Work types. Approved (non-office) types are never marked LATE or penalised. */
export const WORK_TYPES: Record<string, string> = {
  OFFICE: "🏢 Office",
  OUTSTATION: "🧳 Outstation",
  CUSTOMER_VISIT: "🤝 Customer visit",
  PORT_DUTY: "⚓ Port / customs duty",
  REMOTE_WORK: "🏠 Approved remote work",
  APPROVED_LEAVE: "🌴 Approved leave",
};
export const APPROVED_WORK_TYPES = new Set(["OUTSTATION", "CUSTOMER_VISIT", "PORT_DUTY", "REMOTE_WORK", "APPROVED_LEAVE"]);

export type AttendanceSettingT = {
  standardStartTime: string; standardEndTime: string; gracePeriodMinutes: number;
  workingDaysJson: string; lunchBreakMinutes: number; overtimeEnabled: boolean;
  diamondRewardEnabled: boolean; onTimeDiamondReward: number; completeDayDiamondReward: number;
  weeklyStreakDiamondReward: number; monthlyPerfectAttendanceReward: number;
  lateDeductionEnabled: boolean; lateDeductionDiamond: number; missingCheckoutDeductionDiamond: number;
  locationRequired: boolean; photoRequired: boolean;
};

export async function getAttendanceSetting(): Promise<AttendanceSettingT> {
  return prisma.attendanceSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
}

export const hmToMinutes = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** ISO weekday (Mon=1..Sun=7) of a "YYYY-MM-DD" key. */
function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // Sun=0
  return d === 0 ? 7 : d;
}

export function isWorkingDay(dateStr: string, setting: AttendanceSettingT): boolean {
  try {
    const days: number[] = JSON.parse(setting.workingDaysJson);
    return days.includes(isoWeekday(dateStr));
  } catch {
    return isoWeekday(dateStr) <= 5;
  }
}

export function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Format a stored timestamp as KL wall-clock "HH:MM". */
export function klHM(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** Minutes-since-midnight (KL) of a stored timestamp. */
export function klMinutesOf(d: Date): number {
  return hmToMinutes(klHM(d));
}

const ON_TIME_STATUSES = new Set(["PRESENT", "COMPLETED", "EARLY_LEAVE"]);

/** Consecutive on-time WORKING days ending at endDate (skips non-working days). */
export async function onTimeWorkingStreak(userId: string, endDate: string, setting: AttendanceSettingT): Promise<number> {
  const rows = await prisma.attendanceRecord.findMany({
    where: { userId, clockIn: { not: null } },
    select: { date: true, status: true, lateMinutes: true },
    orderBy: { date: "desc" }, take: 80,
  });
  const byDate = new Map(rows.map((r) => [r.date, r]));
  let streak = 0;
  let day = endDate;
  for (let guard = 0; guard < 90; guard++) {
    if (!isWorkingDay(day, setting)) { day = addDays(day, -1); continue; }
    const rec = byDate.get(day);
    if (!rec || rec.lateMinutes > 0 || !ON_TIME_STATUSES.has(rec.status)) break;
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/** Idempotently post an attendance diamond reward (+) or penalty (−). */
export async function postAttendanceDiamond(args: {
  userId: string; amount: number; sourceType: string; reason: string; refId: string; notifyTitle?: string;
}): Promise<boolean> {
  if (args.amount === 0) return false;
  const dup = await prisma.pointsTransaction.findFirst({ where: { userId: args.userId, refType: "ATTENDANCE", refId: args.refId } });
  if (dup) return false;
  await awardPoints(prisma, {
    userId: args.userId, amount: args.amount, type: args.amount > 0 ? "BONUS" : "PENALTY",
    transactionType: args.amount > 0 ? "EARN" : "DEDUCT", sourceType: args.sourceType,
    reason: args.reason, refType: "ATTENDANCE", refId: args.refId,
  });
  await logAudit(prisma, {
    action: args.amount > 0 ? "ATTENDANCE_DIAMOND_AWARDED" : "ATTENDANCE_DIAMOND_DEDUCTED",
    entityId: args.refId, entityType: "ATTENDANCE", performedBy: "SYSTEM", affectedUserId: args.userId,
    newValue: { amount: args.amount, reason: args.reason },
  });
  if (args.notifyTitle) {
    await notify(prisma, { userId: args.userId, type: args.amount > 0 ? "POINTS_AWARDED" : "POINTS_DEDUCTED", title: args.notifyTitle, body: args.reason, link: "/attendance" });
  }
  return true;
}

/**
 * Lazy day-finalizer: past working days with a check-in but no check-out become
 * MISSING_CHECK_OUT (with the configured deduction, once). Also settles the
 * previous month's perfect-attendance award. Safe to call repeatedly.
 */
export async function finalizeOpenDays(userId: string) {
  const setting = await getAttendanceSetting();
  const { dateStr, period } = klNow();

  // 1. Missing check-outs on past days.
  const open = await prisma.attendanceRecord.findMany({
    where: { userId, date: { lt: dateStr }, clockIn: { not: null }, clockOut: null, status: { notIn: ["MISSING_CHECK_OUT", "LEAVE", "ABSENT"] } },
    take: 10,
  });
  for (const rec of open) {
    await prisma.attendanceRecord.update({
      where: { id: rec.id },
      data: { status: "MISSING_CHECK_OUT", diamondDeducted: rec.diamondDeducted + (setting.lateDeductionEnabled ? setting.missingCheckoutDeductionDiamond : 0) },
    });
    if (setting.diamondRewardEnabled && setting.missingCheckoutDeductionDiamond > 0) {
      await postAttendanceDiamond({
        userId, amount: -setting.missingCheckoutDeductionDiamond, sourceType: "MISSING_CHECKOUT_PENALTY",
        reason: `Missing check-out on ${rec.date}`, refId: `missing-${rec.date}`,
        notifyTitle: `⚠️ Missing check-out on ${rec.date}`,
      });
    }
  }
  if (open.length > 0) await recomputeAttendanceCounters(userId);

  // 2. Previous-month perfect attendance (settled in the first days of a new month).
  const prevPeriod = period === dateStr.slice(0, 7) ? addDays(`${period}-01`, -1).slice(0, 7) : period;
  if (setting.diamondRewardEnabled && setting.monthlyPerfectAttendanceReward > 0) {
    const already = await prisma.pointsTransaction.findFirst({ where: { userId, refType: "ATTENDANCE", refId: `perfect-${prevPeriod}` } });
    if (!already) {
      const monthRecords = await prisma.attendanceRecord.findMany({ where: { userId, period: prevPeriod } });
      const byDate = new Map(monthRecords.map((r) => [r.date, r]));
      // Every working day of the previous month must be on time and complete.
      let day = `${prevPeriod}-01`;
      let perfect = true;
      let workdays = 0;
      while (day.slice(0, 7) === prevPeriod) {
        if (isWorkingDay(day, setting)) {
          workdays++;
          const rec = byDate.get(day);
          const excused = rec && APPROVED_WORK_TYPES.has(rec.workType);
          const onTime = rec && rec.clockIn && rec.clockOut && rec.lateMinutes === 0 && ON_TIME_STATUSES.has(rec.status);
          if (!onTime && !excused) { perfect = false; break; }
        }
        day = addDays(day, 1);
      }
      if (perfect && workdays >= 15) {
        await postAttendanceDiamond({
          userId, amount: setting.monthlyPerfectAttendanceReward, sourceType: "PERFECT_ATTENDANCE",
          reason: `🏆 Perfect attendance for ${prevPeriod}`, refId: `perfect-${prevPeriod}`,
          notifyTitle: `🏆 Perfect attendance! +${setting.monthlyPerfectAttendanceReward} 💎`,
        });
      }
    }
  }

  // 3. Coaching alert: 3+ late/missing in the current month (once per month).
  const problems = await prisma.attendanceRecord.count({ where: { userId, period, OR: [{ status: "MISSING_CHECK_OUT" }, { lateMinutes: { gt: 0 } }] } });
  if (problems >= 3) {
    const flagged = await prisma.auditLog.findFirst({ where: { action: "ATTENDANCE_COACHING_ALERT", affectedUserId: userId, entityId: period } });
    if (!flagged) {
      await logAudit(prisma, { action: "ATTENDANCE_COACHING_ALERT", entityId: period, entityType: "ATTENDANCE", performedBy: "SYSTEM", affectedUserId: userId, newValue: { problems } });
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, managerId: true } });
      if (u?.managerId) {
        await notify(prisma, { userId: u.managerId, type: "CUSTOMER_COMPLAINT", title: "⏰ Attendance coaching alert", body: `${u.name} has ${problems} late/missing attendance issues this month.`, link: "/attendance/team" });
      }
    }
  }
}
