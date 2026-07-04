"use server";

import { prisma } from "@/lib/prisma";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { validatePassword } from "@/lib/user-permissions";
import { logAudit } from "@/lib/audit";

/** The signed-in user sets a new password (used for the forced first-login reset). */
export async function changeOwnPassword(formData: FormData): Promise<{ ok: true }> {
  const s = await getSession();
  if (!s) throw new Error("Please log in again.");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const user = await prisma.user.findUnique({ where: { id: s.id }, select: { passwordHash: true } });
  if (!user) throw new Error("Account not found.");
  if (!(await verifyPassword(current, user.passwordHash))) throw new Error("Your current password is incorrect.");
  const err = validatePassword(next);
  if (err) throw new Error(err);
  if (next !== confirm) throw new Error("The new passwords do not match.");
  if (await verifyPassword(next, user.passwordHash)) throw new Error("Choose a password different from your current one.");

  await prisma.user.update({ where: { id: s.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await logAudit(prisma, { action: "PASSWORD_CHANGED_SELF", entityId: s.id, entityType: "USER", performedBy: s.id, affectedUserId: s.id });
  return { ok: true };
}
