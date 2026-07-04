"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { currentPeriod } from "@/lib/enums";

export type JobRecResult = { ok: true } | { ok: false; error: string };

/** Staff (or managers on behalf of staff) log a handled job. */
export async function logJobHandling(fd: FormData): Promise<JobRecResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };

  const forUserId = String(fd.get("userId") ?? "") || s.id;
  const manager = isBoss(s.role) || s.role === "DEPARTMENT_HEAD" || s.role === "HR_ADMIN";
  if (forUserId !== s.id && !manager) return { ok: false, error: "You can only log your own jobs." };

  const jobNo = String(fd.get("jobNo") ?? "").trim().toUpperCase();
  const jobType = String(fd.get("jobType") ?? "").trim();
  const jobMonth = String(fd.get("jobMonth") ?? "") || currentPeriod();
  if (!jobNo) return { ok: false, error: "Job number is required." };
  if (!jobType) return { ok: false, error: "Pick the job type." };
  if (!/^\d{4}-\d{2}$/.test(jobMonth)) return { ok: false, error: "Month must be YYYY-MM." };

  const user = await prisma.user.findUnique({ where: { id: forUserId }, select: { departmentId: true } });

  try {
    await prisma.jobHandlingRecord.create({
      data: {
        userId: forUserId,
        departmentId: user?.departmentId ?? null,
        jobNo,
        customerName: String(fd.get("customerName") ?? "").trim() || null,
        jobType,
        serviceType: String(fd.get("serviceType") ?? "") || null,
        jobMonth,
        handledRole: String(fd.get("handledRole") ?? "") || null,
        status: String(fd.get("status") ?? "IN_PROGRESS"),
        startedAt: new Date(),
        completedAt: String(fd.get("status") ?? "") === "COMPLETED" ? new Date() : null,
        note: String(fd.get("note") ?? "") || null,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return { ok: false, error: `Job ${jobNo} (${jobType.replace(/_/g, " ").toLowerCase()}) is already logged for this month — duplicates don't count.` };
    }
    console.error("logJobHandling:", e);
    return { ok: false, error: "Could not save the job record — please try again." };
  }
  revalidatePath("/jobs/handling-records");
  return { ok: true };
}

/** Update status / validity / quality (managers validate; staff complete own). */
export async function updateJobHandling(fd: FormData): Promise<JobRecResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const id = String(fd.get("id") ?? "");
  const rec = await prisma.jobHandlingRecord.findUnique({ where: { id } });
  if (!rec) return { ok: false, error: "Record not found." };

  const manager = isBoss(s.role) || s.role === "DEPARTMENT_HEAD" || s.role === "HR_ADMIN";
  if (rec.userId !== s.id && !manager) return { ok: false, error: "Not your record." };

  const status = String(fd.get("status") ?? rec.status);
  const data: Record<string, unknown> = {
    status,
    completedAt: status === "COMPLETED" && !rec.completedAt ? new Date() : rec.completedAt,
  };
  // Only managers may change KPI validity / quality / errors (staff cannot boost their own score).
  if (manager) {
    if (fd.has("isValidForKPI")) data.isValidForKPI = String(fd.get("isValidForKPI")) === "true";
    if (fd.has("qualityScore")) data.qualityScore = Math.max(0, Math.min(120, Number(fd.get("qualityScore")) || 100));
    if (fd.has("errorCount")) data.errorCount = Math.max(0, Math.round(Number(fd.get("errorCount")) || 0));
    if (fd.has("customerImpact")) data.customerImpact = String(fd.get("customerImpact")) || null;
    if (status === "EXCLUDED_FROM_KPI" || status === "CANCELLED") data.isValidForKPI = false;
    await logAudit(prisma, { action: "JOB_RECORD_VALIDATED", entityId: id, entityType: "JOB_HANDLING", performedBy: s.id, actorName: s.name, affectedUserId: rec.userId, newValue: data });
  } else if (status === "EXCLUDED_FROM_KPI") {
    return { ok: false, error: "Only managers can exclude records from KPI." };
  }

  await prisma.jobHandlingRecord.update({ where: { id }, data });
  revalidatePath("/jobs/handling-records");
  return { ok: true };
}

export async function deleteJobHandling(id: string): Promise<JobRecResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const rec = await prisma.jobHandlingRecord.findUnique({ where: { id } });
  if (!rec) return { ok: true };
  const manager = isBoss(s.role) || s.role === "DEPARTMENT_HEAD";
  if (rec.userId !== s.id && !manager) return { ok: false, error: "Not your record." };
  await prisma.jobHandlingRecord.delete({ where: { id } });
  await logAudit(prisma, { action: "JOB_RECORD_DELETED", entityId: id, entityType: "JOB_HANDLING", performedBy: s.id, actorName: s.name, affectedUserId: rec.userId, oldValue: { jobNo: rec.jobNo, jobType: rec.jobType } });
  revalidatePath("/jobs/handling-records");
  return { ok: true };
}
