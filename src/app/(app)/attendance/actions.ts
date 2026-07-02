"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { klNow, LATE_AFTER_MINUTES, recomputeAttendanceCounters } from "@/lib/attendance";
import { logAudit } from "@/lib/audit";

/** Staff clocks in for today. Late after 09:15 (KL time). Idempotent per day. */
export async function clockIn() {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const { dateStr, period, minutes } = klNow();
  const existing = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: s.id, date: dateStr } } });
  if (existing?.clockIn) throw new Error("You have already clocked in today.");

  const status = minutes > LATE_AFTER_MINUTES ? "LATE" : "PRESENT";
  await prisma.attendanceRecord.upsert({
    where: { userId_date: { userId: s.id, date: dateStr } },
    create: { userId: s.id, date: dateStr, period, clockIn: new Date(), status },
    update: { clockIn: new Date(), status },
  });
  await recomputeAttendanceCounters(s.id);
  revalidatePath("/attendance");
}

/** Staff clocks out for today. */
export async function clockOut() {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const { dateStr } = klNow();
  const rec = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: s.id, date: dateStr } } });
  if (!rec?.clockIn) throw new Error("Clock in first.");
  await prisma.attendanceRecord.update({ where: { id: rec.id }, data: { clockOut: new Date() } });
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
