"use server";

import { prisma } from "@/lib/prisma";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { validatePassword } from "@/lib/user-permissions";
import { logAudit } from "@/lib/audit";

export type ChangePwResult = { ok: true } | { ok: false; error: string };

/**
 * The signed-in user sets a new password (forced first-login reset).
 * Returns an error result (never throws for validation) so the client shows the
 * real reason — thrown errors are redacted by Next.js in production.
 */
export async function changeOwnPassword(formData: FormData): Promise<ChangePwResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Your session expired — please log in again." };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const user = await prisma.user.findUnique({ where: { id: s.id }, select: { passwordHash: true } });
  if (!user) return { ok: false, error: "Account not found." };
  if (!(await verifyPassword(current, user.passwordHash))) return { ok: false, error: "Your current password is incorrect." };
  const err = validatePassword(next);
  if (err) return { ok: false, error: err };
  if (next !== confirm) return { ok: false, error: "The new passwords do not match." };
  if (await verifyPassword(next, user.passwordHash)) return { ok: false, error: "Choose a password different from your current one." };

  await prisma.user.update({ where: { id: s.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await logAudit(prisma, { action: "PASSWORD_CHANGED_SELF", entityId: s.id, entityType: "USER", performedBy: s.id, affectedUserId: s.id });
  return { ok: true };
}
