"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { awardPoints } from "@/lib/points";
import { PROPOSAL_CATEGORIES } from "@/lib/proposals";

function canFinalReview(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

function sanitizeUrl(url: string): string | null {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  return base && url.startsWith(`${base}/storage/v1/object/public/uploads/`) ? url : null;
}

/** Suggested diamond reward per spec tiers, shown to the approver as a default. */
export async function suggestedAcceptReward(category: string, impactValue: number): Promise<number> {
  if (category === "COST_SAVING") {
    if (impactValue > 5000) return 500; // Boss custom above this — start high
    if (impactValue >= 1000) return 500;
    if (impactValue > 0) return 200;
  }
  if (category === "REVENUE_GROWTH") return 300;
  if (["CUSTOMER_SERVICE", "SOP_IMPROVEMENT", "RISK_PREVENTION"].includes(category)) return 200;
  if (category === "AUTOMATION_AI") return 300;
  return 100;
}

/** Staff submits a proposal (goes to Department Head for first review). */
export async function createProposal(formData: FormData) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const problemObserved = String(formData.get("problemObserved") ?? "").trim();
  const proposedSolution = String(formData.get("proposedSolution") ?? "").trim();
  const expectedBenefit = String(formData.get("expectedBenefit") ?? "").trim() || null;
  const estimatedImpactValue = Math.max(0, Number(formData.get("estimatedImpactValue") ?? 0));
  const impactedDepartmentId = String(formData.get("impactedDepartmentId") ?? "") || null;
  const attachmentUrl = sanitizeUrl(String(formData.get("attachmentUrl") ?? ""));
  if (!title || !problemObserved || !proposedSolution) throw new Error("Title, problem and solution are required.");
  if (!PROPOSAL_CATEGORIES[category]) throw new Error("Pick a category.");

  const p = await prisma.proposal.create({
    data: { title, category, problemObserved, proposedSolution, expectedBenefit, estimatedImpactValue, impactedDepartmentId, submittedById: s.id, attachmentUrl },
  });
  await prisma.proposalReview.create({ data: { proposalId: p.id, reviewerId: s.id, action: "SUBMIT", comment: null } });
  await logAudit(prisma, { action: "PROPOSAL_SUBMITTED", entityId: p.id, entityType: "PROPOSAL", performedBy: s.id, affectedUserId: s.id, newValue: { title, category } });
  await notify(prisma, { userId: s.id, type: "ANNOUNCEMENT", title: "💡 Your proposal has been submitted.", body: title, link: "/proposals" });

  // Notify dept head (first reviewer) + bosses.
  const me = await prisma.user.findUnique({ where: { id: s.id }, select: { departmentId: true } });
  const reviewers = await prisma.user.findMany({
    where: { OR: [{ role: { in: ["SUPER_ADMIN", "MANAGEMENT"] } }, { role: "DEPARTMENT_HEAD", departmentId: me?.departmentId ?? "" }] },
    select: { id: true },
  });
  await Promise.all(reviewers.map((r) => notify(prisma, { userId: r.id, type: "ANNOUNCEMENT", title: "💡 New improvement proposal", body: `${s.name}: ${title}`, link: "/proposals" })));
  revalidatePath("/proposals");
}

/** Department Head first-stage review: move to UNDER_REVIEW or request revision. */
export async function firstStageReview(proposalId: string, action: "REVIEW" | "REQUEST_REVISION", comment: string) {
  const s = await getSession();
  if (!s || !(canFinalReview(s.role) || s.role === "DEPARTMENT_HEAD")) throw new Error("Forbidden");
  const p = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!p || !["SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED"].includes(p.status)) throw new Error("Proposal is not reviewable.");

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: action === "REVIEW" ? "UNDER_REVIEW" : "REVISION_REQUESTED", reviewedById: s.id, reviewedAt: new Date(), reviewerComment: comment || null } });
  await prisma.proposalReview.create({ data: { proposalId, reviewerId: s.id, action, comment: comment || null } });
  if (action === "REQUEST_REVISION") {
    await notify(prisma, { userId: p.submittedById, type: "ANNOUNCEMENT", title: "Your proposal needs improvement.", body: comment || "Please review the feedback and update your idea.", link: "/proposals" });
  }
  revalidatePath("/proposals");
}

/** Boss/HR accepts a proposal and awards diamonds (Boss sets/overrides the amount). */
export async function acceptProposal(proposalId: string, diamondAmount: number, comment: string) {
  const s = await getSession();
  if (!s || !canFinalReview(s.role)) throw new Error("Only Boss/HR can accept proposals.");
  const p = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!p || ["ACCEPTED", "IMPLEMENTED", "REJECTED"].includes(p.status)) throw new Error("Proposal already decided.");
  const amount = Math.max(0, Math.round(diamondAmount));

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({ where: { id: proposalId }, data: { status: "ACCEPTED", acceptedAt: new Date(), reviewedById: s.id, reviewedAt: new Date(), reviewerComment: comment || null, diamondsAwarded: amount } });
    await tx.proposalReview.create({ data: { proposalId, reviewerId: s.id, action: "ACCEPT", comment: comment || null, diamondsAwarded: amount } });
    if (amount > 0) {
      await awardPoints(tx, {
        userId: p.submittedById, amount, type: "BONUS", transactionType: "EARN", sourceType: "PROPOSAL_ACCEPTED",
        reason: `Proposal accepted by company: ${p.title}`, refType: "PROPOSAL", refId: p.id,
      });
    }
  });
  await logAudit(prisma, { action: "PROPOSAL_ACCEPTED", entityId: proposalId, entityType: "PROPOSAL", performedBy: s.id, affectedUserId: p.submittedById, newValue: { diamonds: amount } });
  await notify(prisma, { userId: p.submittedById, type: "POINTS_AWARDED", title: `🎉 Your proposal has been accepted. You received ${amount} diamonds.`, body: p.title, link: "/proposals" });
  revalidatePath("/proposals");
}

/** Boss/HR rejects with constructive feedback (required). */
export async function rejectProposal(proposalId: string, reason: string) {
  const s = await getSession();
  if (!s || !canFinalReview(s.role)) throw new Error("Only Boss/HR can reject proposals.");
  if (!reason.trim()) throw new Error("Give constructive feedback — every idea deserves a reason.");
  const p = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!p || ["ACCEPTED", "IMPLEMENTED", "REJECTED"].includes(p.status)) throw new Error("Proposal already decided.");

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: "REJECTED", reviewedById: s.id, reviewedAt: new Date(), reviewerComment: reason } });
  await prisma.proposalReview.create({ data: { proposalId, reviewerId: s.id, action: "REJECT", comment: reason } });
  await logAudit(prisma, { action: "PROPOSAL_REJECTED", entityId: proposalId, entityType: "PROPOSAL", performedBy: s.id, affectedUserId: p.submittedById, newValue: { reason } });
  await notify(prisma, { userId: p.submittedById, type: "ANNOUNCEMENT", title: "Your proposal was not accepted this time.", body: `Feedback: ${reason}`, link: "/proposals" });
  revalidatePath("/proposals");
}

/** Boss marks an accepted proposal implemented, awarding extra diamonds. */
export async function markImplemented(proposalId: string, extraDiamonds: number, comment: string) {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only the Boss can mark proposals implemented.");
  const p = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!p || p.status !== "ACCEPTED") throw new Error("Only accepted proposals can be marked implemented.");
  const amount = Math.max(0, Math.round(extraDiamonds));

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({ where: { id: proposalId }, data: { status: "IMPLEMENTED", implementedAt: new Date(), diamondsAwarded: p.diamondsAwarded + amount } });
    await tx.proposalReview.create({ data: { proposalId, reviewerId: s.id, action: "MARK_IMPLEMENTED", comment: comment || null, diamondsAwarded: amount } });
    if (amount > 0) {
      await awardPoints(tx, {
        userId: p.submittedById, amount, type: "BONUS", transactionType: "EARN", sourceType: "PROPOSAL_IMPLEMENTED",
        reason: `Proposal implemented by company: ${p.title}`, refType: "PROPOSAL", refId: p.id,
      });
    }
  });
  await logAudit(prisma, { action: "PROPOSAL_IMPLEMENTED", entityId: proposalId, entityType: "PROPOSAL", performedBy: s.id, affectedUserId: p.submittedById, newValue: { extraDiamonds: amount } });
  await notify(prisma, { userId: p.submittedById, type: "POINTS_AWARDED", title: `🚀 Your proposal has been implemented. You received an additional ${amount} diamonds.`, body: p.title, link: "/proposals" });
  revalidatePath("/proposals");
}
