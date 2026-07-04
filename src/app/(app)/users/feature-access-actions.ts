"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { FEATURES } from "@/lib/features";

/**
 * Boss/Management sets per-user feature rights: for each feature key,
 * "DEFAULT" (remove override), "ALLOW", "DENY", or "PARTIAL" (allowed but
 * scoped to selected items, e.g. specific training topic folders). Audited.
 */
export async function setUserFeatureAccess(
  targetUserId: string,
  entries: { featureKey: string; access: "DEFAULT" | "ALLOW" | "DENY" | "PARTIAL"; topicIds?: string[] }[],
) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only Boss/Management can change feature access.");

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true, name: true } });
  if (!target) throw new Error("User not found.");
  if (isBoss(target.role)) throw new Error("Boss/Management accounts cannot be restricted.");

  const changes: Record<string, string> = {};
  for (const e of entries) {
    const def = FEATURES[e.featureKey];
    if (!def) continue;
    if (e.access === "DEFAULT") {
      const del = await prisma.userFeatureAccess.deleteMany({ where: { userId: targetUserId, featureKey: e.featureKey } });
      if (del.count > 0) changes[e.featureKey] = "DEFAULT";
    } else {
      // PARTIAL only for scopable features, with validated real topic ids.
      let scopeJson: string | null = null;
      if (e.access === "PARTIAL") {
        if (!def.scopable) throw new Error(`${def.label} does not support partial access.`);
        const ids = (e.topicIds ?? []).filter(Boolean);
        if (ids.length === 0) throw new Error(`Pick at least one topic folder for partial access to ${def.label}.`);
        const valid = await prisma.trainingTopic.findMany({ where: { id: { in: ids } }, select: { id: true } });
        if (valid.length === 0) throw new Error("None of the selected topic folders exist.");
        scopeJson = JSON.stringify({ topicIds: valid.map((v) => v.id) });
      }
      const existing = await prisma.userFeatureAccess.findUnique({ where: { userId_featureKey: { userId: targetUserId, featureKey: e.featureKey } } });
      if (existing?.access !== e.access || (existing?.scopeJson ?? null) !== scopeJson) {
        await prisma.userFeatureAccess.upsert({
          where: { userId_featureKey: { userId: targetUserId, featureKey: e.featureKey } },
          create: { userId: targetUserId, featureKey: e.featureKey, access: e.access, scopeJson, updatedBy: s.id },
          update: { access: e.access, scopeJson, updatedBy: s.id },
        });
        changes[e.featureKey] = e.access === "PARTIAL" ? `PARTIAL(${JSON.parse(scopeJson!).topicIds.length} topics)` : e.access;
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
