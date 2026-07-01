import { prisma } from "./prisma";
import { awardPoints } from "./points";
import { logAudit } from "./audit";
import { notify } from "./notify";
import { currentPeriod } from "./enums";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Owner Diamond Authority engine.
 *
 * "Diamonds" are the app's existing Points currency — this module reuses the
 * PointsTransaction ledger + wallet recompute (src/lib/points.ts), the audit log
 * and the notification pipeline. Every mutation snapshots balanceBefore/After and
 * writes an audit row. Transactions are never deleted — reversal/void post a
 * compensating entry and flag the original.
 */

// Local role check to avoid pulling the rbac → auth → server-only chain (keeps
// this module importable from plain scripts/tests).
const isBossRole = (role: string) => role === "SUPER_ADMIN" || role === "MANAGEMENT";

export function canGenerateDiamond(user: { role: string; hasOwnerDiamondAuthority?: boolean }): boolean {
  return isBossRole(user.role) || Boolean(user.hasOwnerDiamondAuthority);
}

/** Source-type options for the Generate Diamonds form (spec C / G). */
export const DIAMOND_SOURCE_TYPES: Record<string, string> = {
  OWNER_BONUS: "Owner Bonus",
  KPI: "KPI Bonus",
  SPECIAL_CONTRIBUTION: "Special Contribution",
  CUSTOMER_COMPLIMENT: "Customer Compliment",
  TEAMWORK: "Teamwork Reward",
  URGENT_CASE: "Urgent Case Reward",
  FESTIVAL_BONUS: "Festival Bonus",
  ANNUAL_DINNER_BONUS: "Annual Dinner Bonus",
  CORRECTION: "Correction / Adjustment",
  MANUAL: "Manual Owner Generation",
};

export const DIAMOND_TXN_TYPES: Record<string, string> = {
  EARN: "Earn", DEDUCT: "Deduct", REDEEM: "Redeem", BONUS: "Bonus",
  OWNER_GENERATE: "Owner Generate", OWNER_ADJUST: "Owner Adjust",
  REVERSAL: "Reversal", VOID: "Void",
};

/** Post one diamond ledger entry (with wallet snapshot) inside a transaction. */
async function post(
  db: Db,
  args: {
    userId: string; amount: number; type: string; transactionType: string;
    reason: string; sourceType?: string; generatedBy: string; approvedBy?: string;
    internalNote?: string; status?: string; departmentId?: string | null;
    relatedTransactionId?: string; effectiveDate?: Date;
  },
): Promise<{ txId: string; before: number; after: number }> {
  const u = await db.user.findUnique({ where: { id: args.userId }, select: { currentPoints: true, departmentId: true } });
  const before = u?.currentPoints ?? 0;
  const after = before + args.amount;
  const txId = await awardPoints(db, {
    userId: args.userId, amount: args.amount, type: args.type, reason: args.reason,
    sourceType: args.sourceType, generatedBy: args.generatedBy, internalNote: args.internalNote,
    status: args.status ?? "COMPLETED", transactionType: args.transactionType,
    balanceBefore: before, balanceAfter: after,
    departmentId: args.departmentId ?? u?.departmentId ?? undefined,
    approvedBy: args.approvedBy, relatedTransactionId: args.relatedTransactionId,
    effectiveDate: args.effectiveDate ?? new Date(),
  });
  return { txId, before, after };
}

async function senderName(userId: string): Promise<string> {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? "Owner";
}

// ---------------------------------------------------------------------------
// Wallet + history reads
// ---------------------------------------------------------------------------

export async function getDiamondWallet(userId: string) {
  const [u, owner] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { currentPoints: true, lifetimePoints: true, deductedPoints: true, redeemedPoints: true, monthlyEarned: true, monthlyDeducted: true } }),
    prisma.pointsTransaction.aggregate({ where: { userId, transactionType: "OWNER_GENERATE", amount: { gt: 0 } }, _sum: { amount: true } }),
  ]);
  return {
    currentBalance: u?.currentPoints ?? 0,
    lifetimeEarned: u?.lifetimePoints ?? 0,
    lifetimeDeducted: u?.deductedPoints ?? 0,
    lifetimeRedeemed: u?.redeemedPoints ?? 0,
    lifetimeGeneratedByOwner: owner._sum.amount ?? 0,
    monthlyEarned: u?.monthlyEarned ?? 0,
    monthlyDeducted: u?.monthlyDeducted ?? 0,
  };
}

export interface TxnFilter {
  staffId?: string; departmentId?: string; transactionType?: string;
  sourceType?: string; status?: string; from?: Date; to?: Date; take?: number;
}

/** Scoped transaction history. Owner=all, Dept-Head=own dept, Staff=self, HR=all (read). */
export async function getDiamondTransactions(filter: TxnFilter, viewer: { id: string; role: string; departmentId?: string | null }) {
  const where: Prisma.PointsTransactionWhereInput = {};
  if (viewer.role === "STAFF") where.userId = viewer.id;
  else if (viewer.role === "DEPARTMENT_HEAD") where.user = { departmentId: viewer.departmentId ?? "" };

  if (filter.staffId) where.userId = filter.staffId;
  if (filter.departmentId) where.user = { departmentId: filter.departmentId };
  if (filter.transactionType) where.transactionType = filter.transactionType;
  if (filter.sourceType) where.sourceType = filter.sourceType;
  if (filter.status) where.status = filter.status;
  if (filter.from || filter.to) where.createdAt = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };

  return prisma.pointsTransaction.findMany({
    where, include: { user: { select: { name: true, avatarColor: true, department: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" }, take: filter.take ?? 100,
  });
}

// ---------------------------------------------------------------------------
// Generation (single / department / all)
// ---------------------------------------------------------------------------

export interface GenerateInput {
  targetUserId: string; amount: number; reason: string; sourceType: string;
  effectiveDate?: Date; notifyStaff?: boolean; internalNote?: string;
  generatedBy: string; ownerOverride?: boolean;
}

async function issueToUser(db: Db, user: { id: string }, input: Omit<GenerateInput, "targetUserId">, sender: string) {
  const { txId, before, after } = await post(db, {
    userId: user.id, amount: input.amount, type: "BONUS", transactionType: "OWNER_GENERATE",
    sourceType: input.sourceType, reason: input.reason, generatedBy: input.generatedBy,
    approvedBy: input.generatedBy, internalNote: input.internalNote, effectiveDate: input.effectiveDate,
  });
  await logAudit(db, {
    action: "DIAMOND_GENERATED", entityId: txId, entityType: "DIAMOND", performedBy: input.generatedBy,
    affectedUserId: user.id, oldValue: { balance: before }, newValue: { balance: after, amount: input.amount, sourceType: input.sourceType },
  });
  if (input.notifyStaff) {
    await notify(db, { userId: user.id, type: "POINTS_AWARDED", title: `💎 You received ${input.amount} diamonds`, body: `You received ${input.amount} diamonds from ${sender}. Reason: ${input.reason}.`, link: "/wallet" });
  }
  return { userId: user.id, txId, before, after };
}

function assertAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Diamond amount must be positive.");
}

export async function generateDiamondsByOwner(input: GenerateInput) {
  assertAmount(input.amount);
  if (!input.reason?.trim()) throw new Error("Reason is required.");
  const user = await prisma.user.findUnique({ where: { id: input.targetUserId }, select: { id: true, isActive: true, accessStatus: true } });
  if (!user) throw new Error("Staff not found.");
  if ((!user.isActive || user.accessStatus !== "ACTIVE") && !input.ownerOverride) {
    throw new Error("Staff is deactivated. Enable owner override to issue diamonds.");
  }
  const sender = await senderName(input.generatedBy);
  await maybeBudgetAlert(input.amount, input.generatedBy);
  return prisma.$transaction((tx) => issueToUser(tx, user, input, sender));
}

export interface BulkInput {
  amount: number; reason: string; sourceType: string; effectiveDate?: Date;
  notifyStaff?: boolean; internalNote?: string; generatedBy: string; ownerOverride?: boolean;
}

async function bulkIssue(userIds: string[], input: BulkInput) {
  assertAmount(input.amount);
  if (!input.reason?.trim()) throw new Error("Reason is required.");
  if (userIds.length === 0) throw new Error("No recipients matched.");
  const sender = await senderName(input.generatedBy);
  await maybeBudgetAlert(input.amount * userIds.length, input.generatedBy);
  // One ledger entry per staff (spec F) — all inside one atomic transaction.
  const results = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const id of userIds) out.push(await issueToUser(tx, { id }, input, sender));
    return out;
  });
  return { count: results.length, results };
}

export async function generateDiamondsForDepartment(input: BulkInput & { departmentId: string }) {
  const staff = await prisma.user.findMany({
    where: { departmentId: input.departmentId, role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, ...(input.ownerOverride ? {} : { isActive: true, accessStatus: "ACTIVE" }) },
    select: { id: true },
  });
  return bulkIssue(staff.map((s) => s.id), input);
}

export async function generateDiamondsForAllStaff(input: BulkInput) {
  const staff = await prisma.user.findMany({
    where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, ...(input.ownerOverride ? {} : { isActive: true, accessStatus: "ACTIVE" }) },
    select: { id: true },
  });
  return bulkIssue(staff.map((s) => s.id), input);
}

export async function generateDiamondsForSelected(userIds: string[], input: BulkInput) {
  return bulkIssue(userIds, input);
}

// ---------------------------------------------------------------------------
// Adjustment / deduction
// ---------------------------------------------------------------------------

export interface AdjustInput {
  userId: string; adjustmentType: "ADD" | "DEDUCT"; amount: number; reason: string;
  relatedTransactionId?: string; internalNote?: string; generatedBy: string; ownerOverride?: boolean;
}

export async function adjustDiamondBalance(input: AdjustInput) {
  assertAmount(input.amount);
  if (!input.reason?.trim()) throw new Error("Reason is required.");
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, currentPoints: true } });
  if (!user) throw new Error("Staff not found.");

  const delta = input.adjustmentType === "ADD" ? input.amount : -input.amount;
  if (delta < 0 && user.currentPoints + delta < 0 && !input.ownerOverride) {
    throw new Error("Deduction would make the balance negative. Enable owner override to proceed.");
  }
  const sender = await senderName(input.generatedBy);

  return prisma.$transaction(async (tx) => {
    const { txId, before, after } = await post(tx, {
      userId: user.id, amount: delta, type: input.adjustmentType === "ADD" ? "MANUAL" : "DEDUCT",
      transactionType: "OWNER_ADJUST", sourceType: "CORRECTION", reason: input.reason,
      generatedBy: input.generatedBy, approvedBy: input.generatedBy, internalNote: input.internalNote,
      relatedTransactionId: input.relatedTransactionId,
    });
    await logAudit(tx, {
      action: input.adjustmentType === "ADD" ? "DIAMOND_ADJUSTED" : "DIAMOND_DEDUCTED", entityId: txId, entityType: "DIAMOND",
      performedBy: input.generatedBy, affectedUserId: user.id, oldValue: { balance: before }, newValue: { balance: after },
    });
    await notify(tx, {
      userId: user.id, type: delta < 0 ? "POINTS_DEDUCTED" : "POINTS_AWARDED",
      title: delta < 0 ? `${input.amount} diamonds deducted` : `💎 ${input.amount} diamonds added`,
      body: delta < 0 ? `${input.amount} diamonds were deducted. Reason: ${input.reason}.` : `You received ${input.amount} diamonds from ${sender}. Reason: ${input.reason}.`,
      link: "/wallet",
    });
    return { txId, before, after };
  });
}

export async function deductDiamonds(input: Omit<AdjustInput, "adjustmentType">) {
  return adjustDiamondBalance({ ...input, adjustmentType: "DEDUCT" });
}

// ---------------------------------------------------------------------------
// Reversal / void (never delete)
// ---------------------------------------------------------------------------

async function neutralise(txId: string, by: string, mode: "REVERSAL" | "VOID") {
  const orig = await prisma.pointsTransaction.findUnique({ where: { id: txId } });
  if (!orig) throw new Error("Transaction not found.");
  if (orig.status === "REVERSED" || orig.status === "VOIDED") throw new Error("Transaction has already been reversed or voided.");

  return prisma.$transaction(async (tx) => {
    const { txId: compId, before, after } = await post(tx, {
      userId: orig.userId, amount: -orig.amount,
      type: orig.amount >= 0 ? "DEDUCT" : "MANUAL", transactionType: mode,
      sourceType: "CORRECTION", reason: `${mode === "VOID" ? "Void" : "Reversal"} of transaction ${orig.id}`,
      generatedBy: by, approvedBy: by, relatedTransactionId: orig.id,
    });
    await tx.pointsTransaction.update({ where: { id: orig.id }, data: { status: mode === "VOID" ? "VOIDED" : "REVERSED" } });
    await logAudit(tx, {
      action: mode === "VOID" ? "DIAMOND_VOIDED" : "DIAMOND_REVERSED", entityId: orig.id, entityType: "DIAMOND",
      performedBy: by, affectedUserId: orig.userId, oldValue: { balance: before, amount: orig.amount }, newValue: { balance: after, compensatingTx: compId },
    });
    return { compId, before, after };
  });
}

export const reverseDiamondTransaction = (txId: string, by: string) => neutralise(txId, by, "REVERSAL");
export const voidDiamondTransaction = (txId: string, by: string) => neutralise(txId, by, "VOID");

// ---------------------------------------------------------------------------
// Authority settings + budget
// ---------------------------------------------------------------------------

export async function getDiamondAuthoritySetting() {
  return prisma.diamondAuthoritySetting.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
}

async function monthlyGenerated(): Promise<number> {
  const agg = await prisma.pointsTransaction.aggregate({ where: { transactionType: "OWNER_GENERATE", period: currentPeriod(), amount: { gt: 0 } }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

/** Soft budget alert: notify bosses if this generation pushes the month over the limit. */
async function maybeBudgetAlert(addAmount: number, actorId: string) {
  const setting = await getDiamondAuthoritySetting();
  if (!setting.alertOnExceed || setting.monthlyBudgetLimit <= 0) return;
  const used = await monthlyGenerated();
  if (used + addAmount > setting.monthlyBudgetLimit) {
    const bosses = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGEMENT"] } }, select: { id: true } });
    await Promise.all(bosses.map((b) => notify(prisma, { userId: b.id, type: "CUSTOMER_COMPLAINT", title: "⚠️ Monthly diamond budget exceeded", body: `Diamond generation this month (${used + addAmount}) exceeds the limit of ${setting.monthlyBudgetLimit}.`, link: "/owner/diamonds" })));
  }
}

// ---------------------------------------------------------------------------
// Request / approval flow (HR & Department Head propose; Owner approves)
// ---------------------------------------------------------------------------

export interface RequestInput {
  requestedBy: { id: string; role: string; departmentId?: string | null };
  targetUserId?: string; departmentId?: string; amount: number; reason: string; evidenceUrl?: string;
}

export async function createDiamondRequest(input: RequestInput) {
  assertAmount(input.amount);
  if (!input.reason?.trim()) throw new Error("Reason is required.");
  const setting = await getDiamondAuthoritySetting();
  const { role, id, departmentId } = input.requestedBy;

  if (isBossRole(role)) throw new Error("Owners generate diamonds directly — no proposal needed.");
  if (role === "HR_ADMIN") {
    if (!setting.allowHrPropose) throw new Error("HR diamond proposals are disabled by the Owner.");
    if (input.amount > setting.maxHrProposal) throw new Error(`HR proposals cannot exceed ${setting.maxHrProposal} diamonds.`);
  } else if (role === "DEPARTMENT_HEAD") {
    if (!setting.allowDeptHeadPropose) throw new Error("Department Head diamond proposals are disabled by the Owner.");
    if (input.amount > setting.maxDeptHeadProposal) throw new Error(`Department Head proposals cannot exceed ${setting.maxDeptHeadProposal} diamonds.`);
    if (input.departmentId && input.departmentId !== departmentId) throw new Error("You can only propose for your own department.");
  } else {
    throw new Error("Your role cannot propose diamond bonuses.");
  }

  const req = await prisma.diamondRequest.create({
    data: { targetUserId: input.targetUserId ?? null, departmentId: input.departmentId ?? null, amount: input.amount, reason: input.reason, evidenceUrl: input.evidenceUrl ?? null, requestedById: id },
  });
  await logAudit(prisma, { action: "DIAMOND_REQUEST_CREATED", entityId: req.id, entityType: "DIAMOND_REQUEST", performedBy: id, affectedUserId: input.targetUserId ?? undefined, newValue: { amount: input.amount, reason: input.reason } });
  const proposer = await senderName(id);
  const bosses = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGEMENT"] } }, select: { id: true } });
  await Promise.all(bosses.map((b) => notify(prisma, { userId: b.id, type: "REWARD_APPROVED", title: "💎 Diamond bonus request", body: `${proposer} proposed ${input.amount} diamonds. Reason: ${input.reason}.`, link: "/diamonds/requests" })));
  return req;
}

export async function approveDiamondRequest(requestId: string, approverId: string) {
  const req = await prisma.diamondRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING_OWNER_APPROVAL") throw new Error("Request is not pending.");

  // Generate the proposed diamonds (individual or whole department).
  if (req.departmentId && !req.targetUserId) {
    await generateDiamondsForDepartment({ departmentId: req.departmentId, amount: req.amount, reason: req.reason, sourceType: "OWNER_BONUS", notifyStaff: true, generatedBy: approverId });
  } else if (req.targetUserId) {
    await generateDiamondsByOwner({ targetUserId: req.targetUserId, amount: req.amount, reason: req.reason, sourceType: "OWNER_BONUS", notifyStaff: true, generatedBy: approverId });
  } else {
    throw new Error("Request has no recipient.");
  }

  await prisma.diamondRequest.update({ where: { id: requestId }, data: { status: "COMPLETED", decidedById: approverId, decidedAt: new Date() } });
  await logAudit(prisma, { action: "DIAMOND_REQUEST_APPROVED", entityId: requestId, entityType: "DIAMOND_REQUEST", performedBy: approverId, affectedUserId: req.targetUserId ?? undefined, newValue: { amount: req.amount } });
  await notify(prisma, { userId: req.requestedById, type: "REWARD_APPROVED", title: "Diamond request approved ✅", body: "Your diamond reward request has been approved.", link: "/diamonds/requests" });
  return { ok: true };
}

export async function rejectDiamondRequest(requestId: string, approverId: string, reason: string) {
  const req = await prisma.diamondRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING_OWNER_APPROVAL") throw new Error("Request is not pending.");
  await prisma.diamondRequest.update({ where: { id: requestId }, data: { status: "REJECTED", decidedById: approverId, decidedReason: reason, decidedAt: new Date() } });
  await logAudit(prisma, { action: "DIAMOND_REQUEST_REJECTED", entityId: requestId, entityType: "DIAMOND_REQUEST", performedBy: approverId, affectedUserId: req.targetUserId ?? undefined, newValue: { reason } });
  await notify(prisma, { userId: req.requestedById, type: "REWARD_REJECTED", title: "Diamond request declined", body: `Your diamond reward request was not approved. Reason: ${reason}.`, link: "/diamonds/requests" });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Authority grant + CSV export
// ---------------------------------------------------------------------------

export async function setOwnerDiamondAuthority(targetUserId: string, grant: boolean, by: string) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { hasOwnerDiamondAuthority: true } });
  if (!target) throw new Error("User not found.");
  await prisma.user.update({ where: { id: targetUserId }, data: { hasOwnerDiamondAuthority: grant } });
  await logAudit(prisma, { action: grant ? "DIAMOND_AUTHORITY_GRANTED" : "DIAMOND_AUTHORITY_REMOVED", entityId: targetUserId, entityType: "USER", performedBy: by, affectedUserId: targetUserId, oldValue: { hasOwnerDiamondAuthority: target.hasOwnerDiamondAuthority }, newValue: { hasOwnerDiamondAuthority: grant } });
}

export async function exportDiamondReport(filter: TxnFilter, viewer: { id: string; role: string; departmentId?: string | null }): Promise<string> {
  const rows = await getDiamondTransactions({ ...filter, take: 5000 }, viewer);
  const header = ["Date", "Staff", "Department", "Type", "Source", "Amount", "BalanceBefore", "BalanceAfter", "Reason", "GeneratedBy", "Status"];
  const csv = [header.join(",")];
  for (const r of rows) {
    const cells = [
      r.createdAt.toISOString(), r.user.name, r.user.department?.name ?? "", r.transactionType ?? r.type,
      r.sourceType ?? "", String(r.amount), String(r.balanceBefore ?? ""), String(r.balanceAfter ?? ""),
      (r.reason ?? "").replace(/"/g, "'"), r.generatedBy ?? "", r.status,
    ].map((c) => `"${c}"`);
    csv.push(cells.join(","));
  }
  return csv.join("\n");
}
