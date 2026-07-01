"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canApproveTasks, isBoss } from "@/lib/rbac";
import { awardPoints } from "@/lib/points";
import { notify } from "@/lib/notify";
import { createCoachingIfAbsent } from "@/services/scoring";
import { currentPeriod } from "@/lib/enums";

function ensureManager(role: string) {
  if (!(canApproveTasks(role) || role === "HR_ADMIN")) throw new Error("Forbidden");
}

/**
 * Apply a penalty to a staff member. Penalties are for INTERNAL-cause issues
 * only — the UI requires the manager to confirm the cause is not an external
 * party (vessel/customs/port/weather/etc.). Auto-creates coaching / escalates
 * red-line cases per the rule configuration.
 */
export async function applyPenalty(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  ensureManager(session.role);

  const staffId = String(formData.get("staffId") ?? "");
  const ruleId = String(formData.get("ruleId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const internalCause = formData.get("internalCause"); // checkbox
  if (!staffId || !ruleId) return;
  if (!internalCause) throw new Error("You must confirm the issue was caused by an internal mistake (not an external party).");

  const [rule, staff] = await Promise.all([
    prisma.penaltyRule.findUnique({ where: { id: ruleId } }),
    prisma.user.findUnique({ where: { id: staffId } }),
  ]);
  if (!rule || !staff) throw new Error("Not found");

  const reason = `${rule.name}${note ? ` — ${note}` : ""}`;

  await prisma.$transaction(async (tx) => {
    if (rule.deductionPoints > 0) {
      await awardPoints(tx, {
        userId: staffId, amount: -rule.deductionPoints, type: "PENALTY",
        reason, refType: "PENALTY", refId: rule.id,
      });
    }
    await notify(tx, {
      userId: staffId, type: "POINTS_DEDUCTED",
      title: rule.isRedLine ? "⛔ Red-line case logged" : `Penalty applied · -${rule.deductionPoints} pts`,
      body: reason, link: "/wallet",
    });
  });

  // Coaching / escalation.
  if (rule.coachingTrigger || rule.isRedLine) {
    const coachId = staff.managerId ?? session.id;
    await createCoachingIfAbsent(
      staffId, coachId, rule.isRedLine ? "BEHAVIOUR" : "OTHER",
      reason, rule.isRedLine ? "RED_LINE" : "MANUAL", currentPeriod(),
    );
  }
  if (rule.isRedLine) {
    // Escalate to all bosses.
    const bosses = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGEMENT"] } }, select: { id: true } });
    await Promise.all(bosses.map((b) => notify(prisma, { userId: b.id, type: "CUSTOMER_COMPLAINT", title: "⛔ Red-line case", body: `${staff.name}: ${reason}`, link: "/points-admin" })));
  }
  revalidatePath("/points-admin");
  revalidatePath("/wallet");
}

/** Award special contribution / recognition points (positive). */
export async function awardContribution(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  ensureManager(session.role);

  const staffId = String(formData.get("staffId") ?? "");
  const points = Number(formData.get("points") ?? 0);
  const label = String(formData.get("label") ?? "Contribution").trim();
  const type = String(formData.get("type") ?? "MANUAL");
  if (!staffId || points <= 0) return;

  await awardPoints(prisma, { userId: staffId, amount: points, type, reason: `Recognition: ${label}` });
  await notify(prisma, { userId: staffId, type: "POINTS_AWARDED", title: `Recognition · +${points} pts 🌟`, body: label, link: "/wallet" });
  revalidatePath("/points-admin");
  revalidatePath("/wallet");
}

/** Toggle a company-level leave-redemption block flag (boss/HR). */
export async function toggleLeaveBlock(key: string, label: string, enabled: boolean) {
  const session = await getSession();
  if (!session || !(isBoss(session.role) || session.role === "HR_ADMIN")) throw new Error("Forbidden");
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, label, enabled },
    update: { enabled },
  });
  revalidatePath("/points-admin");
  revalidatePath("/rewards");
}

/** Free-form manual adjustment (boss/HR). Positive earns, negative deducts. */
export async function adjustPoints(formData: FormData) {
  const session = await getSession();
  if (!session || !(isBoss(session.role) || session.role === "HR_ADMIN")) throw new Error("Forbidden");

  const staffId = String(formData.get("staffId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "Manual adjustment").trim();
  if (!staffId || !amount) return;

  await awardPoints(prisma, { userId: staffId, amount, type: amount < 0 ? "PENALTY" : "MANUAL", reason });
  await notify(prisma, { userId: staffId, type: amount < 0 ? "POINTS_DEDUCTED" : "POINTS_AWARDED", title: `Adjustment · ${amount > 0 ? "+" : ""}${amount} pts`, body: reason, link: "/wallet" });
  revalidatePath("/points-admin");
}
