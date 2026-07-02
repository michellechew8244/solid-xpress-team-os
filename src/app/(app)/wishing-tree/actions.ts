"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { awardPoints } from "@/lib/points";

async function bosses() {
  return prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGEMENT"] } }, select: { id: true } });
}

function sanitizePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  return base && url.startsWith(`${base}/storage/v1/object/public/uploads/`) ? url : null;
}

/** Staff plants a wish tied to a mission-impossible challenge (goes to Boss for approval). */
export async function createWish(formData: FormData) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const title = String(formData.get("title") ?? "").trim();
  const challenge = String(formData.get("challenge") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const emoji = String(formData.get("emoji") ?? "🌟").trim() || "🌟";
  if (!title) throw new Error("What's your wish? Give it a title.");
  if (!challenge) throw new Error("Add the Mission Impossible challenge you'll take on to earn it.");

  // Optional self-stake: escrowed now; doubled on grant, lost on fail, refunded on reject.
  const stakeAmount = Math.max(0, Math.round(Number(formData.get("stakeAmount") ?? 0)));
  if (stakeAmount > 0) {
    const me = await prisma.user.findUnique({ where: { id: s.id }, select: { currentPoints: true } });
    if ((me?.currentPoints ?? 0) < stakeAmount) throw new Error(`You only have ${me?.currentPoints ?? 0} 💎 — you can't stake ${stakeAmount}.`);
  }

  const wish = await prisma.$transaction(async (tx) => {
    const w = await tx.wish.create({ data: { userId: s.id, title, description, emoji, challenge, stakeAmount } });
    if (stakeAmount > 0) {
      await awardPoints(tx, {
        userId: s.id, amount: -stakeAmount, type: "MANUAL", transactionType: "DEDUCT", sourceType: "WISH_STAKE",
        reason: `🌳 Staked on wish challenge: ${title}`, refType: "WISH", refId: w.id,
      });
    }
    return w;
  });
  await logAudit(prisma, { action: "WISH_CREATED", entityId: wish.id, entityType: "WISH", performedBy: s.id, affectedUserId: s.id, newValue: { title, challenge, stakeAmount } });
  const bs = await bosses();
  await Promise.all(bs.map((b) => notify(prisma, { userId: b.id, type: "ANNOUNCEMENT", title: "🌳 New wish on the Wishing Tree", body: `${s.name} wishes: "${title}" — challenge: ${challenge}`, link: "/wishing-tree" })));
  revalidatePath("/wishing-tree");
}

/** Boss approves the wish → the mission-impossible challenge goes live. */
export async function approveWish(wishId: string) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Boss can approve wishes.");
  const wish = await prisma.wish.findUnique({ where: { id: wishId } });
  if (!wish || wish.status !== "PENDING") throw new Error("Wish is not pending.");
  await prisma.wish.update({ where: { id: wishId }, data: { status: "APPROVED", decidedById: s.id, decidedAt: new Date() } });
  await logAudit(prisma, { action: "WISH_APPROVED", entityId: wishId, entityType: "WISH", performedBy: s.id, affectedUserId: wish.userId });
  await notify(prisma, { userId: wish.userId, type: "ANNOUNCEMENT", title: "🌟 Your wish is approved!", body: `Challenge accepted: ${wish.challenge}. Complete it, then submit your proof to claim your wish!`, link: "/wishing-tree" });
  revalidatePath("/wishing-tree");
}

/** Boss rejects the wish with a note. */
export async function rejectWish(wishId: string, note: string) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Boss can reject wishes.");
  const wish = await prisma.wish.findUnique({ where: { id: wishId } });
  if (!wish || wish.status !== "PENDING") throw new Error("Wish is not pending.");
  await prisma.$transaction(async (tx) => {
    await tx.wish.update({ where: { id: wishId }, data: { status: "REJECTED", decisionNote: note || null, decidedById: s.id, decidedAt: new Date() } });
    // Rejection returns the escrowed stake in full.
    if (wish.stakeAmount > 0) {
      await awardPoints(tx, {
        userId: wish.userId, amount: wish.stakeAmount, type: "MANUAL", transactionType: "EARN", sourceType: "WISH_STAKE_REFUND",
        reason: `🌳 Stake refunded (wish rejected): ${wish.title}`, refType: "WISH", refId: wish.id,
      });
    }
  });
  await logAudit(prisma, { action: "WISH_REJECTED", entityId: wishId, entityType: "WISH", performedBy: s.id, affectedUserId: wish.userId, newValue: { note, stakeRefunded: wish.stakeAmount } });
  await notify(prisma, { userId: wish.userId, type: "ANNOUNCEMENT", title: "Wish not approved", body: `${note ? `Reason: ${note}. ` : ""}${wish.stakeAmount > 0 ? `Your ${wish.stakeAmount} 💎 stake has been refunded.` : ""}`.trim() || "Your wish was not approved this time.", link: "/wishing-tree" });
  revalidatePath("/wishing-tree");
}

/** Staff submits proof that they completed the mission-impossible challenge. */
export async function submitWishProof(formData: FormData) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const wishId = String(formData.get("wishId") ?? "");
  const evidenceUrl = sanitizePhotoUrl(String(formData.get("evidenceUrl") ?? ""));
  const wish = await prisma.wish.findUnique({ where: { id: wishId } });
  if (!wish || wish.userId !== s.id) throw new Error("Wish not found.");
  if (wish.status !== "APPROVED" && wish.status !== "PROOF_SUBMITTED") throw new Error("This wish is not in progress.");
  if (!evidenceUrl) throw new Error("Attach a photo/screenshot as proof of your challenge.");

  await prisma.wish.update({ where: { id: wishId }, data: { status: "PROOF_SUBMITTED", evidenceUrl, completedAt: new Date() } });
  const bs = await bosses();
  await Promise.all(bs.map((b) => notify(prisma, { userId: b.id, type: "ANNOUNCEMENT", title: "🏁 Challenge proof submitted", body: `${s.name} completed the challenge for "${wish.title}". Review and grant the wish!`, link: "/wishing-tree" })));
  revalidatePath("/wishing-tree");
}

/** Boss verifies the proof and GRANTS the wish 🎉 (or marks the challenge failed). */
export async function decideWishOutcome(wishId: string, grant: boolean, note: string) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Boss can grant or fail wishes.");
  const wish = await prisma.wish.findUnique({ where: { id: wishId } });
  if (!wish || wish.status !== "PROOF_SUBMITTED") throw new Error("No proof to review for this wish.");

  await prisma.$transaction(async (tx) => {
    await tx.wish.update({ where: { id: wishId }, data: { status: grant ? "GRANTED" : "FAILED", decisionNote: note || null, decidedById: s.id, decidedAt: new Date() } });
    // Grant returns the stake DOUBLED (escrow back + equal winnings). A failed
    // challenge forfeits the escrowed stake — no entry needed, it's already gone.
    if (grant && wish.stakeAmount > 0) {
      await awardPoints(tx, {
        userId: wish.userId, amount: wish.stakeAmount * 2, type: "BONUS", transactionType: "EARN", sourceType: "WISH_STAKE_WIN",
        reason: `🌳 Challenge won — stake returned doubled: ${wish.title}`, refType: "WISH", refId: wish.id,
      });
    }
  });
  await logAudit(prisma, { action: grant ? "WISH_GRANTED" : "WISH_FAILED", entityId: wishId, entityType: "WISH", performedBy: s.id, affectedUserId: wish.userId, newValue: { note, stake: wish.stakeAmount, stakePaidOut: grant ? wish.stakeAmount * 2 : 0 } });
  await notify(prisma, {
    userId: wish.userId, type: "ANNOUNCEMENT",
    title: grant ? "🎉 Wish GRANTED!" : "Challenge not passed",
    body: grant
      ? `Congratulations! Your wish "${wish.title}" has been granted.${wish.stakeAmount > 0 ? ` Your ${wish.stakeAmount} 💎 stake comes back DOUBLED: +${wish.stakeAmount * 2} 💎!` : ""} ${note ?? ""}`.trim()
      : `${note ? `Reason: ${note}. ` : "The challenge wasn't quite met — try again! "}${wish.stakeAmount > 0 ? `Your ${wish.stakeAmount} 💎 stake was forfeited.` : ""}`.trim(),
    link: "/wishing-tree",
  });
  revalidatePath("/wishing-tree");
}
