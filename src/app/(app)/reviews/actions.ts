"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canApproveTasks, isBoss } from "@/lib/rbac";
import { generateReview } from "@/services/scoring";

/**
 * Auto-generate monthly performance reviews from real data (KPI, tasks, points,
 * teamwork, discipline). Scoped to the manager's department; boss/HR run all.
 */
export async function generateReviews() {
  const session = await getSession();
  if (!session || !(canApproveTasks(session.role) || session.role === "HR_ADMIN")) throw new Error("Forbidden");

  const where =
    isBoss(session.role) || session.role === "HR_ADMIN"
      ? { role: { in: ["STAFF", "DEPARTMENT_HEAD"] } }
      : { departmentId: session.departmentId ?? "", role: "STAFF" };

  const staff = await prisma.user.findMany({ where, select: { id: true, managerId: true } });
  for (const s of staff) {
    await generateReview(s.id, s.managerId ?? session.id);
  }
  revalidatePath("/reviews");
}
