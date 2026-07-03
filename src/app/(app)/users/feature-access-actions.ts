"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { FEATURES } from "@/lib/features";

/**
 * Boss/Management sets per-user feature rights: for each feature key,
 * "DEFAULT" (remove override), "ALLOW", or "DENY". Fully audited.
 */
export async function setUserFeatureAccess(targetUserId: string, entries: { featureKey: string; access: "DEFAULT" | "ALLOW" | "DENY" }[]) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only Boss/Management can change feature access.");

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true, name: true } });
  if (!target) throw new Error("User not found.");
  if (isBoss(target.role)) throw new Error("Boss/Management accounts cannot be restricted.");

  const changes: Record<string, string> = {};
  for (const e of entries) {
    if (!FEATURES[e.featureKey]) continue;
    if (e.access === "DEFAULT") {
      const del = await prisma.userFeatureAccess.deleteMany({ where: { userId: targetUserId, featureKey: e.featureKey } });
      if (del.count > 0) changes[e.featureKey] = "DEFAULT";
    } else {
      const existing = await prisma.userFeatureAccess.findUnique({ where: { userId_featureKey: { userId: targetUserId, featureKey: e.featureKey } } });
      if (existing?.access !== e.access) {
        await prisma.userFeatureAccess.upsert({
          where: { userId_featureKey: { userId: targetUserId, featureKey: e.featureKey } },
          create: { userId: targetUserId, featureKey: e.featureKey, access: e.access, updatedBy: s.id },
          update: { access: e.access, updatedBy: s.id },
        });
        changes[e.featureKey] = e.access;
      }
    }
  }

  if (Object.keys(changes).length > 0) {
    await logAudit(prisma, {
      action: "FEATURE_ACCESS_CHANGED", entityId: targetUserId, entityType: "USER",
      performedBy: s.id, actorName: s.name, affectedUserId: targetUserId, newValue: changes,
    });
  }
  revalidatePath(`/users/${targetUserId}`);
  return { changed: Object.keys(changes).length };
}
