"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { buildBonusPool } from "@/lib/bonus-pool";

export type PoolResult = { ok: true } | { ok: false; error: string };

/** Boss builds/rebuilds the month's bonus pool from live data. */
export async function computeBonusPool(fd: FormData): Promise<PoolResult> {
  const s = await getSession();
  if (!s || !isBoss(s.role)) return { ok: false, error: "Only Boss / Management can compute the bonus pool." };
  const period = String(fd.get("period") ?? "");
  const poolPct = Number(fd.get("poolPct") ?? 0) || undefined;
  if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: "Month must be YYYY-MM." };
  await buildBonusPool(period, poolPct);
  await logAudit(prisma, { action: "BONUS_POOL_COMPUTED", entityId: period, entityType: "BONUS_POOL", performedBy: s.id, actorName: s.name, newValue: { poolPct } });
  revalidatePath("/bonus-pool");
  return { ok: true };
}

/** Boss approves the pool (freezes it) and notifies staff with a share. */
export async function approveBonusPool(period: string): Promise<PoolResult> {
  const s = await getSession();
  if (!s || !isBoss(s.role)) return { ok: false, error: "Only Boss / Management can approve." };
  const pool = await prisma.bonusPool.findUnique({ where: { period }, include: { allocations: { include: { individuals: true } } } });
  if (!pool) return { ok: false, error: "Compute the pool first." };
  if (pool.status !== "DRAFT") return { ok: false, error: "This pool is already approved." };
  await prisma.bonusPool.update({ where: { period }, data: { status: "APPROVED", approvedBy: s.id, approvedAt: new Date() } });
  await logAudit(prisma, { action: "BONUS_POOL_APPROVED", entityId: period, entityType: "BONUS_POOL", performedBy: s.id, actorName: s.name, newValue: { poolAmount: pool.poolAmount } });
  const winners = pool.allocations.flatMap((a) => a.individuals.filter((i) => !i.excluded && i.amount > 0));
  await Promise.all(winners.map((w) => notify(prisma, { userId: w.userId, type: "ANNOUNCEMENT", title: "🎁 Team bonus approved", body: `Your ${period} team bonus share is RM ${w.amount.toLocaleString()}.`, link: "/bonus-pool" })));
  revalidatePath("/bonus-pool");
  return { ok: true };
}

/** Boss overrides an individual exclusion (with reason, audited). */
export async function overrideExclusion(fd: FormData): Promise<PoolResult> {
  const s = await getSession();
  if (!s || !isBoss(s.role)) return { ok: false, error: "Only Boss can override exclusions." };
  const id = String(fd.get("id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  if (!reason) return { ok: false, error: "An override reason is required." };
  const row = await prisma.individualBonusAllocation.findUnique({ where: { id }, include: { allocation: { include: { bonusPool: true } } } });
  if (!row) return { ok: false, error: "Row not found." };
  if (row.allocation.bonusPool.status !== "DRAFT") return { ok: false, error: "Pool already approved — recompute first." };
  await prisma.individualBonusAllocation.update({ where: { id }, data: { excluded: false, excludeReason: `Boss override: ${reason}` } });
  await logAudit(prisma, { action: "BONUS_EXCLUSION_OVERRIDDEN", entityId: id, entityType: "BONUS_POOL", performedBy: s.id, actorName: s.name, affectedUserId: row.userId, newValue: { reason } });
  // Recompute weights within the allocation.
  const siblings = await prisma.individualBonusAllocation.findMany({ where: { allocationId: row.allocationId } });
  const total = siblings.filter((x) => !x.excluded).reduce((sum, x) => sum + x.score, 0);
  const alloc = row.allocation;
  for (const sib of siblings) {
    const weight = sib.excluded || total === 0 ? 0 : Math.round((sib.score / total) * 10000) / 10000;
    await prisma.individualBonusAllocation.update({ where: { id: sib.id }, data: { weight, amount: Math.round(alloc.amount * weight * 100) / 100 } });
  }
  revalidatePath("/bonus-pool");
  return { ok: true };
}
