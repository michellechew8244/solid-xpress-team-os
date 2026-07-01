"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function submitDailyReport(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const completed = String(formData.get("completed") ?? "").trim();
  if (!completed) return;

  await prisma.dailyReport.create({
    data: {
      userId: session.id,
      completed,
      pending: String(formData.get("pending") ?? "") || null,
      needHelp: String(formData.get("needHelp") ?? "") || null,
      customerFocus: String(formData.get("customerFocus") ?? "") || null,
      priorities: String(formData.get("priorities") ?? "") || null,
      energyLevel: Number(formData.get("energyLevel") ?? 3),
      confidenceLevel: Number(formData.get("confidenceLevel") ?? 3),
    },
  });

  revalidatePath("/daily-report");
}
