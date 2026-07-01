"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { createDiamondRequest, approveDiamondRequest, rejectDiamondRequest } from "@/lib/diamonds";

export async function submitRequest(formData: FormData) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const amount = Math.round(Number(formData.get("amount") ?? 0));
  const reason = String(formData.get("reason") ?? "").trim();
  const targetUserId = String(formData.get("targetUserId") ?? "") || undefined;
  const departmentId = String(formData.get("departmentId") ?? "") || undefined;
  const evidenceUrl = String(formData.get("evidenceUrl") ?? "").trim() || undefined;
  if (!targetUserId && !departmentId) throw new Error("Choose a staff member or a department.");
  await createDiamondRequest({
    requestedBy: { id: s.id, role: s.role, departmentId: s.departmentId },
    targetUserId, departmentId, amount, reason, evidenceUrl,
  });
  revalidatePath("/diamonds/requests");
}

export async function approveRequest(requestId: string) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Owner can approve diamond requests.");
  await approveDiamondRequest(requestId, s.id);
  revalidatePath("/diamonds/requests");
  revalidatePath("/owner/diamonds");
}

export async function rejectRequest(requestId: string, reason: string) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Owner can reject diamond requests.");
  await rejectDiamondRequest(requestId, s.id, reason || "No reason provided");
  revalidatePath("/diamonds/requests");
}
