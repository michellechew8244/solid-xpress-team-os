"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss, canApproveTasks } from "@/lib/rbac";

function ensureCanManageKpi(role: string) {
  if (!canApproveTasks(role)) throw new Error("Forbidden"); // boss / management / dept head
}

/** Resolve which department a manager may target (dept head locked to own). */
async function targetDept(session: { role: string; departmentId: string | null }, requested: string) {
  if (isBoss(session.role)) return requested || session.departmentId;
  return session.departmentId; // dept head — own department only
}

export async function createKpi(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  ensureCanManageKpi(session.role);

  const name = String(formData.get("name") ?? "").trim();
  const departmentId = await targetDept(session, String(formData.get("departmentId") ?? ""));
  if (!name || !departmentId) return;

  await prisma.kPI.create({
    data: {
      name,
      departmentId,
      formula: String(formData.get("description") ?? "") || null,
      category: String(formData.get("category") ?? "") || null,
      unit: String(formData.get("unit") ?? "") || null,
      targetValue: Number(formData.get("targetValue") ?? 0),
      frequency: String(formData.get("frequency") ?? "MONTHLY"),
      weightage: Number(formData.get("weightage") ?? 1),
      pointMultiplier: Number(formData.get("pointMultiplier") ?? 1),
      maxPoints: Number(formData.get("maxPoints") ?? 250),
      evidenceRequired: formData.get("evidenceRequired") === "on",
      ownerId: session.id,
      reviewerId: session.id,
    },
  });
  revalidatePath("/kpi-setup");
  revalidatePath("/kpi");
}

export async function updateKpi(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  ensureCanManageKpi(session.role);
  const id = String(formData.get("id") ?? "");
  const kpi = await prisma.kPI.findUnique({ where: { id } });
  if (!kpi) return;
  if (!isBoss(session.role) && kpi.departmentId !== session.departmentId) throw new Error("Forbidden");

  await prisma.kPI.update({
    where: { id },
    data: {
      targetValue: Number(formData.get("targetValue") ?? kpi.targetValue),
      frequency: String(formData.get("frequency") ?? kpi.frequency),
      pointMultiplier: Number(formData.get("pointMultiplier") ?? kpi.pointMultiplier),
      maxPoints: Number(formData.get("maxPoints") ?? kpi.maxPoints),
    },
  });
  revalidatePath("/kpi-setup");
}

export async function toggleKpi(id: string, active: boolean) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  ensureCanManageKpi(session.role);
  const kpi = await prisma.kPI.findUnique({ where: { id } });
  if (!kpi) return;
  if (!isBoss(session.role) && kpi.departmentId !== session.departmentId) throw new Error("Forbidden");
  await prisma.kPI.update({ where: { id }, data: { status: active ? "ACTIVE" : "INACTIVE" } });
  revalidatePath("/kpi-setup");
}
