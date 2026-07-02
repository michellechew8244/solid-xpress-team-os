"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { notifyMany } from "@/lib/notify";

function canPost(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

export async function createAnnouncement(formData: FormData) {
  const s = await getSession();
  if (!s || !canPost(s.role)) throw new Error("Only Boss/HR can post announcements.");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const audience = String(formData.get("audience") ?? "ALL");
  const pinned = formData.get("pinned") === "on";
  if (!title || !body) throw new Error("Title and message are required.");

  const a = await prisma.announcement.create({ data: { title, body, audience, pinned, createdById: s.id } });

  // Fan out an in-app notification to the audience.
  const targets = await prisma.user.findMany({
    where: { isActive: true, id: { not: s.id }, ...(audience !== "ALL" ? { departmentId: audience } : {}) },
    select: { id: true },
  });
  await notifyMany(prisma, targets.map((t) => t.id), {
    type: "ANNOUNCEMENT", title: `📢 ${title}`, body: body.slice(0, 120), link: "/announcements",
  });
  revalidatePath("/announcements");
  return a.id;
}

export async function togglePin(id: string) {
  const s = await getSession();
  if (!s || !canPost(s.role)) throw new Error("Forbidden");
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) return;
  await prisma.announcement.update({ where: { id }, data: { pinned: !a.pinned } });
  revalidatePath("/announcements");
}

export async function deleteAnnouncement(id: string) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Boss can delete announcements.");
  await prisma.announcement.delete({ where: { id } });
  revalidatePath("/announcements");
}

export async function markAnnouncementRead(id: string) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: id, userId: s.id } },
    create: { announcementId: id, userId: s.id },
    update: {},
  });
  revalidatePath("/announcements");
}
