"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { awardPoints } from "@/lib/points";
import { notify } from "@/lib/notify";
import { CAMPAIGN_TEMPLATES } from "@/lib/enums";

function canManageDraw(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

/** Staff buys a lucky-draw entry using points (if the campaign allows it). */
export async function buyEntry(campaignId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const [campaign, user] = await Promise.all([
    prisma.luckyDrawCampaign.findUnique({ where: { id: campaignId } }),
    prisma.user.findUnique({ where: { id: session.id } }),
  ]);
  if (!campaign || !user) throw new Error("Not found");
  if (!user.isActive || user.accessStatus !== "ACTIVE") throw new Error("Deactivated accounts cannot join the lucky draw.");
  if (campaign.status !== "ACTIVE") throw new Error("Campaign is not active");
  if (campaign.pointsPerEntry <= 0) throw new Error("This campaign does not sell entries");
  if (user.currentPoints < campaign.pointsPerEntry) throw new Error("Insufficient points");

  await prisma.$transaction(async (tx) => {
    await awardPoints(tx, { userId: user.id, amount: -campaign.pointsPerEntry, type: "REDEMPTION", reason: `Lucky draw entry: ${campaign.title}` });
    // Bought, not earned via achievement — no "hit your goal" celebration for it.
    await tx.luckyDrawEntry.create({ data: { campaignId, userId: user.id, entryCount: 1, sourceType: "TICKET", celebrated: true } });
  });
  revalidatePath("/lucky-draw");
}

/** Admin grants entries to a staff member (e.g. for KPI score / compliment). */
export async function grantEntries(formData: FormData) {
  const session = await getSession();
  if (!session || !canManageDraw(session.role)) throw new Error("Forbidden");
  const campaignId = String(formData.get("campaignId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const count = Number(formData.get("count") ?? 1);
  const sourceType = String(formData.get("sourceType") ?? "MANUAL");
  if (!campaignId || !userId) return;
  // Admin-granted, not auto-detected from a real achievement — no forced celebration moment.
  await prisma.luckyDrawEntry.create({ data: { campaignId, userId, entryCount: count, sourceType, celebrated: true } });
  revalidatePath("/lucky-draw");
}

export async function createCampaign(formData: FormData) {
  const session = await getSession();
  if (!session || !canManageDraw(session.role)) throw new Error("Forbidden");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const campaign = await prisma.luckyDrawCampaign.create({
    data: {
      title,
      campaignType: String(formData.get("campaignType") ?? "MONTHLY_MINI"),
      description: String(formData.get("description") ?? "") || null,
      entryRule: String(formData.get("entryRule") ?? "") || null,
      pointsPerEntry: Number(formData.get("pointsPerEntry") ?? 0),
      drawDate: formData.get("drawDate") ? new Date(String(formData.get("drawDate"))) : null,
      status: "ACTIVE",
    },
  });
  // Optional first prize.
  const prizeName = String(formData.get("prizeName") ?? "").trim();
  if (prizeName) {
    await prisma.luckyDrawPrize.create({ data: { campaignId: campaign.id, prizeName, prizeValue: Number(formData.get("prizeValue") ?? 0), quantity: 1, order: 0 } });
  }
  revalidatePath("/lucky-draw");
}

/** One-click: create a campaign + its prize line-up from a §6B template. */
export async function createFromTemplate(type: string) {
  const session = await getSession();
  if (!session || !canManageDraw(session.role)) throw new Error("Forbidden");
  const tpl = CAMPAIGN_TEMPLATES.find((t) => t.type === type);
  if (!tpl) throw new Error("Unknown template");

  const period = new Date().toISOString().slice(0, 7);
  const campaign = await prisma.luckyDrawCampaign.create({
    data: {
      title: `${period} ${tpl.title}`,
      campaignType: tpl.type,
      description: tpl.description,
      entryRule: tpl.entryRule,
      pointsPerEntry: tpl.pointsPerEntry,
      status: "ACTIVE",
    },
  });
  await prisma.luckyDrawPrize.createMany({
    data: tpl.prizes.map((p, i) => ({ campaignId: campaign.id, prizeName: p.prizeName, prizeValue: p.prizeValue, quantity: p.quantity, order: i })),
  });
  revalidatePath("/lucky-draw");
}

export async function addPrize(formData: FormData) {
  const session = await getSession();
  if (!session || !canManageDraw(session.role)) throw new Error("Forbidden");
  const campaignId = String(formData.get("campaignId") ?? "");
  const prizeName = String(formData.get("prizeName") ?? "").trim();
  if (!campaignId || !prizeName) return;
  const count = await prisma.luckyDrawPrize.count({ where: { campaignId } });
  await prisma.luckyDrawPrize.create({ data: { campaignId, prizeName, prizeDescription: String(formData.get("prizeDescription") ?? "") || null, prizeValue: Number(formData.get("prizeValue") ?? 0), quantity: Number(formData.get("quantity") ?? 1), order: count } });
  revalidatePath("/lucky-draw");
}

export interface DrawResult {
  winnerId: string;
  winnerName: string;
  winnerAvatarColor: string;
  prizeName: string;
  candidates: { userId: string; name: string; avatarColor: string; weight: number }[];
}

/**
 * Draw a random winner for one prize. Weighted by each staff member's entry
 * count. A user who already won another prize in this campaign is excluded
 * (winner cannot win twice). Result is recorded permanently on the prize.
 *
 * Returns the winner + the eligible candidate pool (with each person's entry
 * weight) so the UI can render an honest spin-the-wheel animation that lands
 * on the SAME winner this function already picked server-side — the wheel is
 * purely a visual reveal, it never influences the outcome.
 */
export async function drawPrize(prizeId: string): Promise<DrawResult> {
  const session = await getSession();
  if (!session || !canManageDraw(session.role)) throw new Error("Forbidden");

  const prize = await prisma.luckyDrawPrize.findUnique({ where: { id: prizeId }, include: { campaign: true } });
  if (!prize || prize.status !== "AVAILABLE") throw new Error("Prize not available");

  const [entries, alreadyWon, overdueTasks, redLines] = await Promise.all([
    prisma.luckyDrawEntry.findMany({ where: { campaignId: prize.campaignId }, include: { user: true } }),
    prisma.luckyDrawPrize.findMany({ where: { campaignId: prize.campaignId, winnerUserId: { not: null } }, select: { winnerUserId: true } }),
    // Fairness §7.3: unresolved overdue tasks make a staff ineligible.
    prisma.task.findMany({ where: { status: "OVERDUE" }, select: { assigneeId: true } }),
    // Fairness §7.2: open integrity / red-line case makes a staff ineligible.
    prisma.coachingRecord.findMany({ where: { triggeredBy: "RED_LINE", status: { not: "RESOLVED" } }, select: { staffId: true } }),
  ]);
  // Winner can't win twice; exclude overdue / red-line staff from the pool.
  const excluded = new Set<string | null>(alreadyWon.map((p) => p.winnerUserId));
  for (const t of overdueTasks) excluded.add(t.assigneeId);
  for (const r of redLines) excluded.add(r.staffId);

  // Build a weighted ticket pool (more entries = higher chance) and a
  // deduplicated candidate list (for the wheel's segments) in the same pass.
  const pool: string[] = [];
  const candidateMap = new Map<string, { userId: string; name: string; avatarColor: string; weight: number }>();
  for (const e of entries) {
    if (excluded.has(e.userId)) continue;
    for (let i = 0; i < e.entryCount; i++) pool.push(e.userId);
    const existing = candidateMap.get(e.userId);
    if (existing) existing.weight += e.entryCount;
    else candidateMap.set(e.userId, { userId: e.userId, name: e.user.name, avatarColor: e.user.avatarColor, weight: e.entryCount });
  }
  if (pool.length === 0) throw new Error("No eligible entries (all excluded by overdue / red-line / prior wins).");

  const winnerId = pool[Math.floor(Math.random() * pool.length)];
  await prisma.luckyDrawPrize.update({ where: { id: prizeId }, data: { winnerUserId: winnerId, status: "WON" } });
  await notify(prisma, { userId: winnerId, type: "REWARD_APPROVED", title: "🎉 You won a lucky draw prize!", body: `${prize.prizeName} — ${prize.campaign.title}`, link: "/lucky-draw" });

  // If all prizes drawn, mark campaign DRAWN.
  const remaining = await prisma.luckyDrawPrize.count({ where: { campaignId: prize.campaignId, status: "AVAILABLE" } });
  if (remaining === 0) await prisma.luckyDrawCampaign.update({ where: { id: prize.campaignId }, data: { status: "DRAWN", drawDate: new Date() } });

  revalidatePath("/lucky-draw");

  const winner = candidateMap.get(winnerId)!;
  return {
    winnerId, winnerName: winner.name, winnerAvatarColor: winner.avatarColor, prizeName: prize.prizeName,
    candidates: [...candidateMap.values()],
  };
}

/** Mark the caller's uncelebrated entries in a campaign as celebrated (after the spin plays). */
export async function markEntriesCelebrated(campaignId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await prisma.luckyDrawEntry.updateMany({ where: { campaignId, userId: session.id, celebrated: false }, data: { celebrated: true } });
  revalidatePath("/lucky-draw");
}

export async function markPrizeClaimed(prizeId: string) {
  const session = await getSession();
  if (!session || !canManageDraw(session.role)) throw new Error("Forbidden");
  await prisma.luckyDrawPrize.update({ where: { id: prizeId }, data: { status: "CLAIMED" } });
  revalidatePath("/lucky-draw");
}
