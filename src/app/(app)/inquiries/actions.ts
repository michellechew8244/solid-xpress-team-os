"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { CLOSURE_TYPES } from "@/lib/result-kpi";

export type InqResult = { ok: true } | { ok: false; error: string };

function assigner(role: string) {
  return isBoss(role) || role === "DEPARTMENT_HEAD" || role === "HR_ADMIN";
}

/** Team head / manager assigns an inquiry to a CS staff member. */
export async function assignInquiry(fd: FormData): Promise<InqResult> {
  const s = await getSession();
  if (!s || !assigner(s.role)) return { ok: false, error: "Only Team Head / managers can assign inquiries." };
  const assignedToId = String(fd.get("assignedToId") ?? "");
  const inquiryNo = String(fd.get("inquiryNo") ?? "").trim();
  if (!assignedToId || !inquiryNo) return { ok: false, error: "Inquiry no. and assignee are required." };
  const dueRaw = String(fd.get("dueAt") ?? "");
  await prisma.assignedInquiry.create({
    data: {
      inquiryNo,
      customerName: String(fd.get("customerName") ?? "").trim() || null,
      inquiryType: String(fd.get("inquiryType") ?? "GENERAL"),
      assignedToId,
      assignedById: s.id,
      dueAt: dueRaw ? new Date(`${dueRaw}T23:59:59+08:00`) : null,
      note: String(fd.get("note") ?? "").trim() || null,
    },
  });
  await notify(prisma, { userId: assignedToId, type: "ANNOUNCEMENT", title: "📨 Inquiry assigned to you", body: `${inquiryNo}${fd.get("customerName") ? ` · ${fd.get("customerName")}` : ""}${dueRaw ? ` · due ${dueRaw}` : ""}`, link: "/inquiries" });
  revalidatePath("/inquiries");
  return { ok: true };
}

/** Staff resolve/close their assigned inquiry with a valid closure type. */
export async function closeInquiry(fd: FormData): Promise<InqResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const id = String(fd.get("id") ?? "");
  const inq = await prisma.assignedInquiry.findUnique({ where: { id } });
  if (!inq) return { ok: false, error: "Inquiry not found." };
  if (inq.assignedToId !== s.id && !assigner(s.role)) return { ok: false, error: "Not your inquiry." };
  if (["RESOLVED", "LOST"].includes(inq.status)) return { ok: false, error: "Already closed." };

  const closureType = String(fd.get("closureType") ?? "");
  if (!CLOSURE_TYPES.some((c) => c.key === closureType)) return { ok: false, error: "Pick how the inquiry was closed." };
  const lostReason = String(fd.get("lostReason") ?? "").trim();
  if (closureType === "NO_RESPONSE_LOST" && !lostReason) return { ok: false, error: "Record the lost reason — that is what makes a lost inquiry a properly closed one." };
  const proof = String(fd.get("followUpProofUrl") ?? "").trim();
  if (closureType === "AWAITING_AGENT_RATE" && !proof) return { ok: false, error: "Attach the RFQ / follow-up proof link." };

  await prisma.assignedInquiry.update({
    where: { id },
    data: {
      status: closureType === "NO_RESPONSE_LOST" ? "LOST" : "RESOLVED",
      closureType,
      closedAt: new Date(),
      lostReason: lostReason || null,
      followUpProofUrl: proof || null,
      note: String(fd.get("note") ?? "").trim() || inq.note,
    },
  });
  await logAudit(prisma, { action: "INQUIRY_CLOSED", entityId: id, entityType: "ASSIGNED_INQUIRY", performedBy: s.id, actorName: s.name, newValue: { inquiryNo: inq.inquiryNo, closureType } });
  revalidatePath("/inquiries");
  return { ok: true };
}

/** Mark in progress (staff started working on it). */
export async function startInquiry(id: string): Promise<InqResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const inq = await prisma.assignedInquiry.findUnique({ where: { id } });
  if (!inq || (inq.assignedToId !== s.id && !assigner(s.role))) return { ok: false, error: "Not your inquiry." };
  if (inq.status === "OPEN") await prisma.assignedInquiry.update({ where: { id }, data: { status: "IN_PROGRESS" } });
  revalidatePath("/inquiries");
  return { ok: true };
}
