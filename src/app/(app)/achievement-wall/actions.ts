"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export type FameResult = { ok: true } | { ok: false; error: string };

export const FAME_CATEGORIES = ["GENIUS_RECORD", "MONTHLY_CHAMPION", "YEARLY_CHAMPION", "SWEET_MEMORY", "CUSTOM"] as const;

/** Boss/HR can curate the Wall of Fame. */
function canManage(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

export async function saveFameEntry(fd: FormData): Promise<FameResult> {
  const s = await getSession();
  if (!s || !canManage(s.role)) return { ok: false, error: "Only Boss / HR can edit the Wall of Fame." };
  const id = String(fd.get("id") ?? "");
  const category = String(fd.get("category") ?? "MONTHLY_CHAMPION");
  const data = {
    category: FAME_CATEGORIES.includes(category as typeof FAME_CATEGORIES[number]) ? category : "CUSTOM",
    title: String(fd.get("title") ?? "").trim(),
    honoree: String(fd.get("honoree") ?? "").trim() || null,
    userId: String(fd.get("userId") ?? "") || null,
    periodLabel: String(fd.get("periodLabel") ?? "").trim() || null,
    description: String(fd.get("description") ?? "").trim() || null,
    imageUrl: String(fd.get("imageUrl") ?? "").trim() || null,
    order: Math.round(Number(fd.get("order") ?? 0) || 0),
    isActive: fd.get("isActive") !== "off",
  };
  if (!data.title) return { ok: false, error: "Give the honour a title (e.g. “July Champion”)." };
  // If a real staff member is linked, use their name as the honoree label when blank.
  if (data.userId && !data.honoree) {
    const u = await prisma.user.findUnique({ where: { id: data.userId }, select: { name: true } });
    data.honoree = u?.name ?? null;
  }
  if (id) await prisma.hallOfFameEntry.update({ where: { id }, data });
  else await prisma.hallOfFameEntry.create({ data: { ...data, createdBy: s.id } });
  await logAudit(prisma, { action: id ? "FAME_ENTRY_UPDATED" : "FAME_ENTRY_CREATED", entityId: id || data.title, entityType: "HALL_OF_FAME", performedBy: s.id, actorName: s.name, newValue: { category: data.category, title: data.title } });
  revalidatePath("/achievement-wall");
  return { ok: true };
}

export async function deleteFameEntry(id: string): Promise<FameResult> {
  const s = await getSession();
  if (!s || !canManage(s.role)) return { ok: false, error: "Only Boss / HR can edit the Wall of Fame." };
  await prisma.hallOfFameEntry.delete({ where: { id } });
  await logAudit(prisma, { action: "FAME_ENTRY_DELETED", entityId: id, entityType: "HALL_OF_FAME", performedBy: s.id, actorName: s.name });
  revalidatePath("/achievement-wall");
  return { ok: true };
}
