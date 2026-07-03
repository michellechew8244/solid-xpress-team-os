"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export async function updateAttendanceSetting(formData: FormData) {
  const s = await getSession();
  if (!s || !(isBoss(s.role) || s.role === "HR_ADMIN")) throw new Error("Only Boss/HR can change attendance settings.");

  const bool = (k: string) => formData.get(k) === "on" || formData.get(k) === "true";
  const int = (k: string, d: number) => Math.max(0, Math.round(Number(formData.get(k) ?? d)));
  const hm = (k: string, d: string) => (/^\d{2}:\d{2}$/.test(String(formData.get(k) ?? "")) ? String(formData.get(k)) : d);
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => formData.get(`day${d}`) === "on");

  const data = {
    standardStartTime: hm("standardStartTime", "09:00"),
    standardEndTime: hm("standardEndTime", "18:00"),
    gracePeriodMinutes: int("gracePeriodMinutes", 5),
    workingDaysJson: JSON.stringify(days.length ? days : [1, 2, 3, 4, 5]),
    lunchBreakMinutes: int("lunchBreakMinutes", 60),
    overtimeEnabled: bool("overtimeEnabled"),
    diamondRewardEnabled: bool("diamondRewardEnabled"),
    onTimeDiamondReward: int("onTimeDiamondReward", 5),
    completeDayDiamondReward: int("completeDayDiamondReward", 5),
    weeklyStreakDiamondReward: int("weeklyStreakDiamondReward", 30),
    monthlyPerfectAttendanceReward: int("monthlyPerfectAttendanceReward", 150),
    lateDeductionEnabled: bool("lateDeductionEnabled"),
    lateDeductionDiamond: int("lateDeductionDiamond", 5),
    missingCheckoutDeductionDiamond: int("missingCheckoutDeductionDiamond", 10),
    locationRequired: bool("locationRequired"),
    photoRequired: bool("photoRequired"),
    updatedBy: s.id,
  };
  await prisma.attendanceSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
  await logAudit(prisma, { action: "ATTENDANCE_SETTING_CHANGED", entityId: "singleton", entityType: "ATTENDANCE", performedBy: s.id, newValue: data });
  revalidatePath("/attendance/settings");
  revalidatePath("/attendance");
}
