"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export async function updateDiamondAuthoritySetting(formData: FormData) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Owner can change Diamond Authority settings.");

  const bool = (k: string) => formData.get(k) === "on" || formData.get(k) === "true";
  const int = (k: string, d: number) => Math.max(0, Math.round(Number(formData.get(k) ?? d)));

  const data = {
    allowHrPropose: bool("allowHrPropose"),
    allowDeptHeadPropose: bool("allowDeptHeadPropose"),
    requireOwnerApproval: bool("requireOwnerApproval"),
    maxHrProposal: int("maxHrProposal", 1000),
    maxDeptHeadProposal: int("maxDeptHeadProposal", 500),
    monthlyBudgetLimit: int("monthlyBudgetLimit", 0),
    alertOnExceed: bool("alertOnExceed"),
    updatedById: s.id,
  };
  await prisma.diamondAuthoritySetting.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
  await logAudit(prisma, { action: "DIAMOND_SETTING_CHANGED", entityId: "singleton", entityType: "DIAMOND_SETTING", performedBy: s.id, newValue: data });
  revalidatePath("/settings/diamond-authority");
}
