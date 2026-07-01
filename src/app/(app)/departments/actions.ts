"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";

function code(name: string) {
  return name.replace(/[^a-zA-Z]/g, "").slice(0, 6).toUpperCase() || "DEPT";
}

export async function createDepartment(formData: FormData) {
  const session = await getSession();
  if (!session || !canManageUsers(session.role)) throw new Error("Forbidden");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const exists = await prisma.department.findFirst({ where: { name } });
  if (exists) return;
  await prisma.department.create({
    data: {
      name,
      code: code(name) + Math.floor(Math.random() * 90 + 10),
      description: String(formData.get("description") ?? "") || null,
      revenueTarget: Number(formData.get("revenueTarget") ?? 0),
      grossProfitTarget: Number(formData.get("grossProfitTarget") ?? 0),
    },
  });
  revalidatePath("/departments");
}

export async function updateDepartment(formData: FormData) {
  const session = await getSession();
  if (!session || !canManageUsers(session.role)) throw new Error("Forbidden");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const headId = String(formData.get("headId") ?? "") || null;
  await prisma.department.update({
    where: { id },
    data: {
      description: String(formData.get("description") ?? "") || null,
      headId,
      revenueTarget: Number(formData.get("revenueTarget") ?? 0),
      grossProfitTarget: Number(formData.get("grossProfitTarget") ?? 0),
    },
  });
  // Promote the assigned head to DEPARTMENT_HEAD role if they are plain staff.
  if (headId) {
    const head = await prisma.user.findUnique({ where: { id: headId } });
    if (head && head.role === "STAFF") {
      await prisma.user.update({ where: { id: headId }, data: { role: "DEPARTMENT_HEAD" } });
    }
  }
  revalidatePath("/departments");
}
