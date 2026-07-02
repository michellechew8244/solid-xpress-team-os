"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { klNow, LATE_AFTER_MINUTES, recomputeAttendanceCounters, computeStreak } from "@/lib/attendance";
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

/** Staff clocks in for today, optionally with a photo proof. Late after 09:15 (KL time). */
export async function clockIn(photoUrl?: string | null) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const { dateStr, period, minutes } = klNow();
  const existing = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: s.id, date: dateStr } } });
  if (existing?.clockIn) throw new Error("You have already clocked in today.");

  const status = minutes > LATE_AFTER_MINUTES ? "LATE" : "PRESENT";
  const clockInPhotoUrl = sanitizePhotoUrl(photoUrl);
  await prisma.attendanceRecord.upsert({
    where: { userId_date: { userId: s.id, date: dateStr } },
    create: { userId: s.id, date: dateStr, period, clockIn: new Date(), status, clockInPhotoUrl },
    update: { clockIn: new Date(), status, clockInPhotoUrl },
  });
  await recomputeAttendanceCounters(s.id);

  // 🔥 Streak milestone bonus (idempotent per milestone via the ledger refId).
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

/** Staff clocks out for today, optionally with a photo proof. */
export async function clockOut(photoUrl?: string | null) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const { dateStr } = klNow();
  const rec = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: s.id, date: dateStr } } });
  if (!rec?.clockIn) throw new Error("Clock in first.");
  await prisma.attendanceRecord.update({
    where: { id: rec.id },
    data: { clockOut: new Date(), clockOutPhotoUrl: sanitizePhotoUrl(photoUrl) },
  });
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
