"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canApproveTasks, isBoss } from "@/lib/rbac";
import { awardPoints } from "@/lib/points";
import { taskPoints } from "@/lib/enums";
import { notify } from "@/lib/notify";

async function loadTask(id: string) {
  return prisma.task.findUnique({ where: { id }, include: { assignee: true } });
}

/** Staff moves their task through working statuses. */
export async function setTaskStatus(taskId: string, status: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const task = await loadTask(taskId);
  if (!task) throw new Error("Not found");

  // Assignee or a manager may move the status.
  const allowed = task.assigneeId === session.id || canApproveTasks(session.role);
  if (!allowed) throw new Error("Forbidden");

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === "COMPLETED" ? new Date() : task.completedAt,
    },
  });
  revalidatePath("/missions");
  revalidatePath(`/missions/${taskId}`);
}

/** Staff submits task as completed with proof; awaits reviewer approval. */
export async function submitForApproval(taskId: string, proof: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const task = await loadTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.assigneeId !== session.id && !canApproveTasks(session.role)) throw new Error("Forbidden");

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "COMPLETED", completedAt: new Date(), proofUrl: proof || task.proofUrl },
  });

  // Notify reviewer that approval is needed.
  if (task.reviewerId) {
    await notify(prisma, {
      userId: task.reviewerId,
      type: "TASK_APPROVED",
      title: "Task awaiting approval",
      body: `${session.name} submitted "${task.title}" for approval.`,
      link: `/missions/${taskId}`,
    });
  }
  revalidatePath("/missions");
  revalidatePath(`/missions/${taskId}`);
}

/**
 * Reviewer approves a completed task. Points are awarded ONLY here (section Q),
 * and a staff member cannot approve their own task.
 */
export async function approveTask(taskId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (!canApproveTasks(session.role)) throw new Error("Forbidden");

  const task = await loadTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.assigneeId === session.id && !isBoss(session.role)) {
    throw new Error("You cannot approve your own task.");
  }
  if (task.pointsAwarded) return; // idempotent

  // Task Points = base × difficulty × timeliness (spec formula). Timeliness is
  // derived from completion vs deadline; "early" = finished >24h before due.
  const completed = task.completedAt ?? new Date();
  let timeliness = "ON_TIME";
  if (task.deadline) {
    const diffMs = task.deadline.getTime() - completed.getTime();
    if (diffMs >= 24 * 60 * 60 * 1000) timeliness = "EARLY";
    else if (diffMs < 0) timeliness = "LATE_EXPLAINED"; // proof was submitted = explained
  }
  const award = taskPoints(task.pointsValue, task.difficulty, timeliness);

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: "COMPLETED", approvedAt: new Date(), pointsAwarded: true, timeliness },
    });
    if (task.assigneeId && award > 0) {
      await awardPoints(tx, {
        userId: task.assigneeId,
        amount: award,
        type: "TASK",
        reason: `Task approved: ${task.title} (${task.difficulty} × ${timeliness})`,
        refType: "TASK",
        refId: task.id,
      });
      await notify(tx, {
        userId: task.assigneeId,
        type: "POINTS_AWARDED",
        title: `+${award} points 🎉`,
        body: `Your task "${task.title}" was approved.`,
        link: "/wallet",
      });
    }
  });
  revalidatePath("/missions");
  revalidatePath(`/missions/${taskId}`);
}

/** Reviewer rejects a task; it returns to the staff with a reason. */
export async function rejectTask(taskId: string, reason: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (!canApproveTasks(session.role)) throw new Error("Forbidden");
  const task = await loadTask(taskId);
  if (!task) throw new Error("Not found");

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "REJECTED", rejectReason: reason || "Needs rework." },
  });
  if (task.assigneeId) {
    await notify(prisma, {
      userId: task.assigneeId,
      type: "TASK_REJECTED",
      title: "Task returned for rework",
      body: reason || "Please review and resubmit.",
      link: `/missions/${taskId}`,
    });
  }
  revalidatePath("/missions");
  revalidatePath(`/missions/${taskId}`);
}

export async function toggleChecklist(itemId: string, taskId: string, done: boolean) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await prisma.taskChecklist.update({ where: { id: itemId }, data: { done } });
  revalidatePath(`/missions/${taskId}`);
}

export async function addComment(taskId: string, body: string) {
  const session = await getSession();
  if (!session || !body.trim()) return;
  await prisma.taskComment.create({ data: { taskId, authorId: session.id, body: body.trim() } });
  revalidatePath(`/missions/${taskId}`);
}

/** Create a new mission (managers/boss assign work). */
export async function createTask(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;

  // Staff may create their own missions (self-assigned). A manager creating a
  // mission becomes the reviewer; a staff member's reviewer is their manager so
  // nobody approves their own work.
  const creator = await prisma.user.findUnique({ where: { id: session.id } });
  const isManager = canApproveTasks(session.role);
  const finalAssigneeId = assigneeId ?? (isManager ? null : session.id);
  const assignee = finalAssigneeId ? await prisma.user.findUnique({ where: { id: finalAssigneeId } }) : null;
  const reviewerId = isManager ? session.id : creator?.managerId ?? session.id;

  const task = await prisma.task.create({
    data: {
      title,
      description: String(formData.get("description") ?? "") || null,
      departmentId: assignee?.departmentId ?? session.departmentId,
      assigneeId: finalAssigneeId,
      reviewerId,
      createdById: session.id,
      type: String(formData.get("type") ?? "DAILY"),
      priority: String(formData.get("priority") ?? "MEDIUM"),
      difficulty: String(formData.get("difficulty") ?? "NORMAL"),
      pointsValue: Number(formData.get("pointsValue") ?? 10),
      deadline: formData.get("deadline") ? new Date(String(formData.get("deadline"))) : null,
    },
  });

  // Notify the assignee if a manager assigned it to someone else.
  if (finalAssigneeId && finalAssigneeId !== session.id) {
    await notify(prisma, {
      userId: finalAssigneeId,
      type: "TASK_ASSIGNED",
      title: "New task assigned",
      body: title,
      link: `/missions/${task.id}`,
    });
  }
  revalidatePath("/missions");
}
