"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { deleteStoredFile } from "@/lib/storage";

const REPORT_TYPES = ["JOB_REPORT", "STATUS_REPORT", "PROGRESS_UPDATE", "OTHER"];

function sanitizeUrl(url: string): string | null {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  return base && url.startsWith(`${base}/storage/v1/object/public/uploads/`) ? url : null;
}

/**
 * Staff registers an uploaded job/status report document. The file was already
 * PUT straight to Supabase Storage by the browser (drag & drop); this records
 * it, sets the initial progress, and notifies the manager automatically.
 */
export async function createWorkReport(formData: FormData) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const title = String(formData.get("title") ?? "").trim();
  const reportType = String(formData.get("reportType") ?? "STATUS_REPORT");
  const jobId = String(formData.get("jobId") ?? "") || null;
  const progressPct = Math.max(0, Math.min(100, Math.round(Number(formData.get("progressPct") ?? 0))));
  const progressNote = String(formData.get("progressNote") ?? "").trim() || null;
  const fileUrl = sanitizeUrl(String(formData.get("fileUrl") ?? ""));
  const fileName = String(formData.get("fileName") ?? "").trim();
  const fileType = String(formData.get("fileType") ?? "") || "application/octet-stream";
  const fileSizeBytes = Math.max(0, Number(formData.get("fileSize") ?? 0));
  if (!title) throw new Error("Give the report a title.");
  if (!REPORT_TYPES.includes(reportType)) throw new Error("Invalid report type.");
  if (!fileUrl || !fileName) throw new Error("Attach your Excel/Word/PDF report file.");

  const report = await prisma.workReport.create({
    data: {
      userId: s.id, title, reportType, jobId, fileUrl, fileName, fileType, fileSizeBytes,
      progressPct, progressNote, status: progressPct >= 100 ? "COMPLETED" : "IN_PROGRESS",
    },
  });
  await logAudit(prisma, { action: "WORK_REPORT_UPLOADED", entityId: report.id, entityType: "WORK_REPORT", performedBy: s.id, affectedUserId: s.id, newValue: { title, reportType, fileName, progressPct } });

  // Auto-notify the reporting manager (or bosses when no manager set).
  const me = await prisma.user.findUnique({ where: { id: s.id }, select: { managerId: true } });
  const targets = me?.managerId
    ? [{ id: me.managerId }]
    : await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGEMENT"] } }, select: { id: true } });
  await Promise.all(targets.map((t) => notify(prisma, {
    userId: t.id, type: "ANNOUNCEMENT",
    title: `📄 ${s.name} uploaded a work report`,
    body: `${title} (${reportType.replace(/_/g, " ").toLowerCase()}) · ${progressPct}% progress`,
    link: "/work-reports",
  })));
  revalidatePath("/work-reports");
}

/** Staff updates the progress on their own report (managers may too). */
export async function updateWorkProgress(reportId: string, progressPct: number, note: string) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const report = await prisma.workReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error("Report not found.");
  const manager = isBoss(s.role) || s.role === "HR_ADMIN" || s.role === "DEPARTMENT_HEAD";
  if (report.userId !== s.id && !manager) throw new Error("You can only update your own reports.");

  const pct = Math.max(0, Math.min(100, Math.round(progressPct)));
  const completedNow = pct >= 100 && report.progressPct < 100;
  await prisma.workReport.update({
    where: { id: reportId },
    data: { progressPct: pct, progressNote: note.trim() || report.progressNote, status: pct >= 100 ? "COMPLETED" : "IN_PROGRESS" },
  });
  await logAudit(prisma, { action: "WORK_REPORT_PROGRESS_UPDATED", entityId: reportId, entityType: "WORK_REPORT", performedBy: s.id, affectedUserId: report.userId, oldValue: { progressPct: report.progressPct }, newValue: { progressPct: pct, note } });

  if (completedNow && report.userId === s.id) {
    const me = await prisma.user.findUnique({ where: { id: s.id }, select: { managerId: true, name: true } });
    if (me?.managerId) {
      await notify(prisma, { userId: me.managerId, type: "ANNOUNCEMENT", title: `✅ ${me.name} completed: ${report.title}`, body: "Work report marked 100% complete.", link: "/work-reports" });
    }
  }
  revalidatePath("/work-reports");
}

/** Delete a report (owner or Boss). The stored file is removed too. */
export async function deleteWorkReport(reportId: string) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const report = await prisma.workReport.findUnique({ where: { id: reportId } });
  if (!report) return;
  if (report.userId !== s.id && !isBoss(s.role)) throw new Error("You can only delete your own reports.");
  await prisma.workReport.delete({ where: { id: reportId } });
  await deleteStoredFile(report.fileUrl);
  await logAudit(prisma, { action: "WORK_REPORT_DELETED", entityId: reportId, entityType: "WORK_REPORT", performedBy: s.id, affectedUserId: report.userId, oldValue: { title: report.title, fileName: report.fileName } });
  revalidatePath("/work-reports");
}
