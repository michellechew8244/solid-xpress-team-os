"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { notifyMany } from "@/lib/notify";

/** Post a message to the company-wide staff forum. @mentions notify users. */
export async function postForumMessage(formData: FormData) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  if (body.length > 2000) throw new Error("Message is too long (max 2000 characters).");
  await prisma.forumMessage.create({ data: { userId: s.id, body } });

  // 🔔 @mentions: notify every active user whose name appears after an "@".
  if (body.includes("@")) {
    const users = await prisma.user.findMany({
      where: { isActive: true, NOT: { email: { endsWith: "@solidxpress.system" } } },
      select: { id: true, name: true },
    });
    const lower = body.toLowerCase();
    const mentioned = users.filter((u) => u.id !== s.id && u.name && lower.includes(`@${u.name.toLowerCase()}`));
    if (mentioned.length > 0) {
      await notifyMany(prisma, mentioned.map((u) => u.id), {
        type: "ANNOUNCEMENT",
        title: `💬 ${s.name} mentioned you in the Staff Forum`,
        body: body.length > 120 ? `${body.slice(0, 120)}…` : body,
        link: "/forum",
      });
    }
  }
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
