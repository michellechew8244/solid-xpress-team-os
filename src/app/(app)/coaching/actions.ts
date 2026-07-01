"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canApproveTasks } from "@/lib/rbac";
import { notify } from "@/lib/notify";

export async function createCoaching(formData: FormData) {
  const session = await getSession();
  if (!session || !(canApproveTasks(session.role) || session.role === "HR_ADMIN")) throw new Error("Forbidden");

  const staffId = String(formData.get("staffId") ?? "");
  const issue = String(formData.get("issue") ?? "").trim();
  if (!staffId || !issue) return;

  await prisma.coachingRecord.create({
    data: {
      staffId,
      coachId: session.id,
      category: String(formData.get("category") ?? "KPI_MISSED"),
      issue,
      coachingNote: String(formData.get("coachingNote") ?? "") || null,
      improvementAction: String(formData.get("improvementAction") ?? "") || null,
      deadline: formData.get("deadline") ? new Date(String(formData.get("deadline"))) : null,
      followUpDate: formData.get("deadline") ? new Date(String(formData.get("deadline"))) : null,
    },
  });
  await notify(prisma, { userId: staffId, type: "COACHING_ASSIGNED", title: "Coaching session assigned", body: issue, link: "/coaching" });
  revalidatePath("/coaching");
}

export async function acknowledgeCoaching(id: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const rec = await prisma.coachingRecord.findUnique({ where: { id } });
  if (!rec || rec.staffId !== session.id) throw new Error("Forbidden");
  await prisma.coachingRecord.update({ where: { id }, data: { staffAcknowledged: true, status: "IN_PROGRESS" } });
  revalidatePath("/coaching");
}
