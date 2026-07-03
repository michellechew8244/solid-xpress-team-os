"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";

/** Post a message to the company-wide staff forum. */
export async function postForumMessage(formData: FormData) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  if (body.length > 2000) throw new Error("Message is too long (max 2000 characters).");
  await prisma.forumMessage.create({ data: { userId: s.id, body } });
  revalidatePath("/forum");
}

/** Delete a message — author or Boss/Management (light moderation). */
export async function deleteForumMessage(id: string) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const msg = await prisma.forumMessage.findUnique({ where: { id } });
  if (!msg) return;
  if (msg.userId !== s.id && !isBoss(s.role)) throw new Error("You can only delete your own messages.");
  await prisma.forumMessage.delete({ where: { id } });
  revalidatePath("/forum");
}
