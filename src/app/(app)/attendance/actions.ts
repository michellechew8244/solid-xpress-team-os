"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import {
  klNow, recomputeAttendanceCounters, computeStreak, getAttendanceSetting, hmToMinutes,
  APPROVED_WORK_TYPES, WORK_TYPES, postAttendanceDiamond, onTimeWorkingStreak, finalizeOpenDays, klHM, klMinutesOf,
} from "@/lib/attendance";
import { logAudit } from "@/lib/audit";
import { awardPoints } from "@/lib/points";
import { notify } from "@/lib/notify";
import { STREAK_MILESTONES } from "@/lib/games";

/** Only accept photo URLs that point at our own storage bucket (or none). */
function sanitizePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  return base && url.startsWith(`${base}/storage/v1/object/public/uploads/`) ? url : null;
}

/**
 * Staff checks in. The timestamp is the SERVER time captured here — never
 * supplied by the client. Status/late-minutes come from AttendanceSetting;
 * approved work types (outstation/customer visit/port duty/remote/leave) are
 * never marked late or penalised.
 */
export async function clockIn(photoUrl?: string | null, workType: string = "OFFICE", remark?: string) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const { dateStr, period, minutes } = klNow();
  const existing = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: s.id, date: dateStr } } });
  if (existing?.clockIn) throw new Error("You have already checked in today.");
  if (!WORK_TYPES[workType]) throw new Error("Invalid work type.");

  const setting = await getAttendanceSetting();
  const approvedType = APPROVED_WORK_TYPES.has(workType);
  const lateAfter = hmToMinutes(setting.standardStartTime) + setting.gracePeriodMinutes;
  const lateMinutes = approvedType ? 0 : Math.max(0, minutes - lateAfter);
  const status = lateMinutes > 0 ? "LATE" : "PRESENT";
  const clockInPhotoUrl = sanitizePhotoUrl(photoUrl);
  const now = new Date();

  await prisma.attendanceRecord.upsert({
    where: { userId_date: { userId: s.id, date: dateStr } },
    create: { userId: s.id, date: dateStr, period, clockIn: now, status, clockInPhotoUrl, workType, lateMinutes, checkInRemark: remark || null },
    update: { clockIn: now, status, clockInPhotoUrl, workType, lateMinutes, checkInRemark: remark || null },
  });
  await recomputeAttendanceCounters(s.id);
  await logAudit(prisma, { action: "ATTENDANCE_CHECK_IN", entityId: dateStr, entityType: "ATTENDANCE", performedBy: s.id, affectedUserId: s.id, newValue: { time: klHM(now), workType, lateMinutes } });
  await notify(prisma, { userId: s.id, type: "ANNOUNCEMENT", title: `You checked in at ${klHM(now)}.`, body: lateMinutes > 0 ? `${lateMinutes} minutes late.` : "On time — nice!", link: "/attendance" });

  // 💎 On-time reward / late deduction per settings.
  if (setting.diamondRewardEnabled) {
    if (lateMinutes === 0 && workType !== "APPROVED_LEAVE") {
      await postAttendanceDiamond({
        userId: s.id, amount: setting.onTimeDiamondReward, sourceType: "ATTENDANCE_ON_TIME",
        reason: `On-time check-in on ${dateStr}`, refId: `ontime-${dateStr}`,
        notifyTitle: `✅ On-time check-in! +${setting.onTimeDiamondReward} 💎`,
      });
      await prisma.attendanceRecord.update({ where: { userId_date: { userId: s.id, date: dateStr } }, data: { diamondAwarded: setting.onTimeDiamondReward } });
      // 5 consecutive on-time working days → weekly streak reward (every 5th day).
      const wStreak = await onTimeWorkingStreak(s.id, dateStr, setting);
      if (wStreak > 0 && wStreak % 5 === 0 && setting.weeklyStreakDiamondReward > 0) {
        await postAttendanceDiamond({
          userId: s.id, amount: setting.weeklyStreakDiamondReward, sourceType: "ATTENDANCE_STREAK",
          reason: `🔥 ${wStreak} consecutive on-time working days`, refId: `ontime5-${dateStr}`,
          notifyTitle: `🔥 ${wStreak} on-time days in a row! +${setting.weeklyStreakDiamondReward} 💎`,
        });
      }
    } else if (lateMinutes > 0 && setting.lateDeductionEnabled && setting.lateDeductionDiamond > 0) {
      await postAttendanceDiamond({
        userId: s.id, amount: -setting.lateDeductionDiamond, sourceType: "ATTENDANCE_LATE_PENALTY",
        reason: `Late check-in on ${dateStr} (${lateMinutes} min)`, refId: `late-${dateStr}`,
        notifyTitle: `⏰ Late check-in: -${setting.lateDeductionDiamond} 💎`,
      });
      await prisma.attendanceRecord.update({ where: { userId_date: { userId: s.id, date: dateStr } }, data: { diamondDeducted: setting.lateDeductionDiamond } });
    }
  }

  // 🔥 Legacy check-in streak milestone bonus (idempotent per milestone via the ledger refId).
  const streak = await computeStreak(s.id, dateStr);
  const bonus = STREAK_MILESTONES[streak];
  if (bonus) {
    const refId = `streak-${streak}`;
    const already = await prisma.pointsTransaction.findFirst({ where: { userId: s.id, refType: "STREAK", refId } });
    if (!already) {
      await awardPoints(prisma, {
        userId: s.id, amount: bonus, type: "BONUS", transactionType: "EARN", sourceType: "STREAK",
        reason: `🔥 ${streak}-day check-in streak bonus`, refType: "STREAK", refId,
      });
      await notify(prisma, { userId: s.id, type: "POINTS_AWARDED", title: `🔥 ${streak}-day streak! +${bonus} 💎`, body: "Keep checking in daily to earn more.", link: "/attendance" });
    }
  }

  // Settle any past missing check-outs + previous-month perfect attendance.
  await finalizeOpenDays(s.id);
  revalidatePath("/attendance");
  return { streak, bonus: bonus ?? 0 };
}

/**
 * Daily check-in spin — one fair weighted spin per day, only after clocking in.
 * Returns the prize (and its wheel index) so the UI can animate landing on it.
 */
export async function spinDailyWheel() {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const { dateStr } = klNow();

  const rec = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: s.id, date: dateStr } } });
  if (!rec?.clockIn) throw new Error("Clock in first to earn your daily spin.");

  const existing = await prisma.dailySpin.findUnique({ where: { userId_date: { userId: s.id, date: dateStr } } });
  if (existing) throw new Error("You have already used today's spin. Come back tomorrow!");

  const { SPIN_PRIZES, SPIN_WHEEL_VALUES } = await import("@/lib/games");
  const total = SPIN_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  let prize = SPIN_PRIZES[0].value;
  for (const p of SPIN_PRIZES) { roll -= p.weight; if (roll <= 0) { prize = p.value; break; } }
  // Land on a wheel segment that shows the won value.
  const candidates = SPIN_WHEEL_VALUES.map((v, i) => (v === prize ? i : -1)).filter((i) => i >= 0);
  const segmentIndex = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;

  await prisma.$transaction(async (tx) => {
    await tx.dailySpin.create({ data: { userId: s.id, date: dateStr, prize } });
    await awardPoints(tx, {
      userId: s.id, amount: prize, type: "BONUS", transactionType: "EARN", sourceType: "DAILY_SPIN",
      reason: `🎡 Daily check-in spin: +${prize} 💎`, refType: "DAILY_SPIN", refId: dateStr,
    });
  });
  revalidatePath("/attendance");
  return { prize, segmentIndex };
}

/**
 * Staff checks out. Server timestamp only. Computes total working minutes
 * (minus lunch), early-leave and overtime, and posts the complete-day reward.
 */
export async function clockOut(photoUrl?: string | null, remark?: string) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const { dateStr, minutes } = klNow();
  const rec = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: s.id, date: dateStr } } });
  if (!rec?.clockIn) throw new Error("Check in first.");
  if (rec.clockOut) throw new Error("You have already checked out today.");

  const setting = await getAttendanceSetting();
  const now = new Date();
  const inMin = klMinutesOf(rec.clockIn);
  const rawMinutes = Math.max(0, minutes - inMin);
  const totalWorkMinutes = Math.max(0, rawMinutes - (rawMinutes > setting.lunchBreakMinutes + 60 ? setting.lunchBreakMinutes : 0));
  const endMin = hmToMinutes(setting.standardEndTime);
  const approvedType = APPROVED_WORK_TYPES.has(rec.workType);
  const earlyLeaveMinutes = approvedType ? 0 : Math.max(0, endMin - minutes);
  const overtimeMinutes = setting.overtimeEnabled ? Math.max(0, minutes - endMin) : 0;
  const status = rec.status === "LATE" ? "LATE" : earlyLeaveMinutes > 0 ? "EARLY_LEAVE" : "COMPLETED";

  await prisma.attendanceRecord.update({
    where: { id: rec.id },
    data: {
      clockOut: now, clockOutPhotoUrl: sanitizePhotoUrl(photoUrl), checkOutRemark: remark || null,
      totalWorkMinutes, earlyLeaveMinutes, overtimeMinutes, status,
    },
  });
  await recomputeAttendanceCounters(s.id);
  await logAudit(prisma, { action: "ATTENDANCE_CHECK_OUT", entityId: dateStr, entityType: "ATTENDANCE", performedBy: s.id, affectedUserId: s.id, newValue: { time: klHM(now), totalWorkMinutes, earlyLeaveMinutes, overtimeMinutes } });
  await notify(prisma, { userId: s.id, type: "ANNOUNCEMENT", title: `You checked out at ${klHM(now)}.`, body: `Worked ${Math.floor(totalWorkMinutes / 60)}h ${totalWorkMinutes % 60}m today.`, link: "/attendance" });

  // 💎 Complete-day reward (both check-in and check-out recorded properly).
  if (setting.diamondRewardEnabled && setting.completeDayDiamondReward > 0 && rec.workType !== "APPROVED_LEAVE") {
    const posted = await postAttendanceDiamond({
      userId: s.id, amount: setting.completeDayDiamondReward, sourceType: "ATTENDANCE_COMPLETE",
      reason: `Complete attendance day on ${dateStr}`, refId: `complete-${dateStr}`,
      notifyTitle: `📘 Full day recorded! +${setting.completeDayDiamondReward} 💎`,
    });
    if (posted) {
      await prisma.attendanceRecord.update({ where: { id: rec.id }, data: { diamondAwarded: rec.diamondAwarded + setting.completeDayDiamondReward } });
    }
  }
  revalidatePath("/attendance");
}

/** HR/Boss/Dept-Head sets a status for a staff member on a date (ABSENT / LEAVE / PRESENT / LATE). */
export async function markAttendance(formData: FormData) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const isManager = isBoss(s.role) || s.role === "HR_ADMIN" || s.role === "DEPARTMENT_HEAD";
  if (!isManager) throw new Error("Forbidden");

  const userId = String(formData.get("userId") ?? "");
  const date = String(formData.get("date") ?? "");
  const status = String(formData.get("status") ?? "ABSENT");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Staff and date are required.");
  if (!["PRESENT", "LATE", "ABSENT", "LEAVE"].includes(status)) throw new Error("Invalid status.");

  // Dept heads may only mark their own department.
  if (s.role === "DEPARTMENT_HEAD") {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    if (target?.departmentId !== s.departmentId) throw new Error("You can only mark your own department.");
  }

  await prisma.attendanceRecord.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, period: date.slice(0, 7), status, note },
    update: { status, note },
  });
  await recomputeAttendanceCounters(userId);
  await logAudit(prisma, { action: "ATTENDANCE_MARKED", entityId: userId, entityType: "ATTENDANCE", performedBy: s.id, actorName: s.name, affectedUserId: userId, newValue: { date, status, note } });
  revalidatePath("/attendance");
}
