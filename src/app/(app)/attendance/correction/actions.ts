"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { postAttendanceDiamond, recomputeAttendanceCounters } from "@/lib/attendance";

const REQUEST_TYPES = ["MISSED_CHECK_IN", "MISSED_CHECK_OUT", "WRONG_STATUS", "OUTSTATION_APPROVAL", "LATE_REASON", "OTHER"];

function sanitizeUrl(url: string): string | null {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  return base && url.startsWith(`${base}/storage/v1/object/public/uploads/`) ? url : null;
}

/** Staff submits a correction request. Original timestamps are snapshotted, never edited. */
export async function createCorrectionRequest(formData: FormData) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const date = String(formData.get("date") ?? "");
  const requestType = String(formData.get("requestType") ?? "OTHER");
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceUrl = sanitizeUrl(String(formData.get("evidenceUrl") ?? ""));
  const reqIn = String(formData.get("requestedCheckIn") ?? "");
  const reqOut = String(formData.get("requestedCheckOut") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Pick the date to correct.");
  if (!REQUEST_TYPES.includes(requestType)) throw new Error("Invalid request type.");
  if (!reason) throw new Error("Explain what happened — the reviewer needs context.");

  const record = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: s.id, date } } });
  const toDate = (hm: string) => (/^\d{2}:\d{2}$/.test(hm) ? new Date(`${date}T${hm}:00+08:00`) : null);

  const req = await prisma.attendanceCorrectionRequest.create({
    data: {
      attendanceRecordId: record?.id ?? null, userId: s.id, date, requestType, reason, evidenceUrl,
      requestedCheckInAt: toDate(reqIn), requestedCheckOutAt: toDate(reqOut),
      originalCheckInAt: record?.clockIn ?? null, originalCheckOutAt: record?.clockOut ?? null,
    },
  });
  await logAudit(prisma, { action: "ATTENDANCE_CORRECTION_REQUESTED", entityId: req.id, entityType: "ATTENDANCE", performedBy: s.id, affectedUserId: s.id, newValue: { date, requestType, reason } });
  const reviewers = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGEMENT", "HR_ADMIN"] } }, select: { id: true } });
  await Promise.all(reviewers.map((r) => notify(prisma, { userId: r.id, type: "ANNOUNCEMENT", title: "🕰️ Attendance correction request", body: `${s.name} — ${date}: ${reason.slice(0, 80)}`, link: "/attendance/correction" })));
  revalidatePath("/attendance/correction");
}

/**
 * Boss/HR approves: the request stores the approved times; the record keeps its
 * ORIGINAL timestamps forever and is only flagged APPROVED_CORRECTION. Any
 * late/missing deduction already applied is reversed with a compensating entry.
 */
export async function approveCorrectionRequest(requestId: string, comment: string) {
  const s = await getSession();
  if (!s || !(isBoss(s.role) || s.role === "HR_ADMIN")) throw new Error("Only Boss/HR can review corrections.");
  const req = await prisma.attendanceCorrectionRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") throw new Error("Request is not pending.");

  await prisma.attendanceCorrectionRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", reviewedBy: s.id, reviewedAt: new Date(), reviewerComment: comment || null },
  });

  const record = req.attendanceRecordId ? await prisma.attendanceRecord.findUnique({ where: { id: req.attendanceRecordId } }) : null;
  if (record) {
    await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { correctionStatus: "APPROVED_CORRECTION", status: "PRESENT", lateMinutes: 0 },
    });
    // Reverse any deduction that the (now excused) late/missing caused.
    if (record.diamondDeducted > 0) {
      await postAttendanceDiamond({
        userId: record.userId, amount: record.diamondDeducted, sourceType: "CORRECTION_REVERSAL",
        reason: `Attendance correction approved for ${record.date} — deduction reversed`, refId: `corr-${requestId}`,
        notifyTitle: `↩️ Deduction reversed: +${record.diamondDeducted} 💎`,
      });
      await prisma.attendanceRecord.update({ where: { id: record.id }, data: { diamondDeducted: 0 } });
    }
    await recomputeAttendanceCounters(record.userId);
  } else if (req.requestType === "MISSED_CHECK_IN" && req.requestedCheckInAt) {
    // No record existed (fully missed day) — create a corrected record flagged
    // as an approved correction; the "requested" time is stored as note-worthy
    // metadata but clockIn/clockOut stay null (no fake server timestamps).
    await prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: req.userId, date: req.date } },
      create: { userId: req.userId, date: req.date, period: req.date.slice(0, 7), status: "PRESENT", correctionStatus: "APPROVED_CORRECTION", note: `Approved correction: ${req.reason}` },
      update: { status: "PRESENT", correctionStatus: "APPROVED_CORRECTION" },
    });
    await recomputeAttendanceCounters(req.userId);
  }

  await logAudit(prisma, { action: "ATTENDANCE_CORRECTION_APPROVED", entityId: requestId, entityType: "ATTENDANCE", performedBy: s.id, affectedUserId: req.userId, oldValue: { originalCheckInAt: req.originalCheckInAt, originalCheckOutAt: req.originalCheckOutAt }, newValue: { requestedCheckInAt: req.requestedCheckInAt, requestedCheckOutAt: req.requestedCheckOutAt, comment } });
  await notify(prisma, { userId: req.userId, type: "ANNOUNCEMENT", title: "✅ Attendance correction approved", body: `Your correction for ${req.date} has been approved.${comment ? ` Note: ${comment}` : ""}`, link: "/attendance" });
  revalidatePath("/attendance/correction");
  revalidatePath("/attendance");
}

export async function rejectCorrectionRequest(requestId: string, comment: string) {
  const s = await getSession();
  if (!s || !(isBoss(s.role) || s.role === "HR_ADMIN")) throw new Error("Only Boss/HR can review corrections.");
  const req = await prisma.attendanceCorrectionRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") throw new Error("Request is not pending.");
  await prisma.attendanceCorrectionRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", reviewedBy: s.id, reviewedAt: new Date(), reviewerComment: comment || null },
  });
  await logAudit(prisma, { action: "ATTENDANCE_CORRECTION_REJECTED", entityId: requestId, entityType: "ATTENDANCE", performedBy: s.id, affectedUserId: req.userId, newValue: { comment } });
  await notify(prisma, { userId: req.userId, type: "ANNOUNCEMENT", title: "Attendance correction rejected", body: comment ? `Reason: ${comment}` : "Your correction request was not approved.", link: "/attendance/correction" });
  revalidatePath("/attendance/correction");
}
