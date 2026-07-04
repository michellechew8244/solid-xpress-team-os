"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { saveCompanyPerformance, saveDepartmentPerformance } from "@/lib/performance";

async function bossActor() {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only Boss / Management can manage goals.");
  return s;
}

const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0) || 0;

/** Create/update the company goal for a period. */
export async function saveCompanyGoal(fd: FormData) {
  const s = await bossActor();
  const period = String(fd.get("period") ?? "").trim();
  if (!/^\d{4}(-\d{2})?$/.test(period)) throw new Error("Period must be YYYY or YYYY-MM.");
  const data = {
    periodType: period.length === 4 ? "YEAR" : "MONTH",
    revenueTarget: num(fd, "revenueTarget"), gpTarget: num(fd, "gpTarget"),
    gpMarginTargetPct: num(fd, "gpMarginTargetPct"), collectionTarget: num(fd, "collectionTarget"),
    newCustomerTarget: Math.round(num(fd, "newCustomerTarget")), retentionTargetPct: num(fd, "retentionTargetPct"),
    satisfactionTargetPct: num(fd, "satisfactionTargetPct"), errorReductionTargetPct: num(fd, "errorReductionTargetPct"),
    shortBillingControlTargetPct: num(fd, "shortBillingControlTargetPct"), onTimeBillingTargetPct: num(fd, "onTimeBillingTargetPct"),
    proposalAcceptedTarget: Math.round(num(fd, "proposalAcceptedTarget")), attendanceTargetPct: num(fd, "attendanceTargetPct"),
    departmentScoreTarget: num(fd, "departmentScoreTarget"), companyScoreTarget: num(fd, "companyScoreTarget"),
    rewardBudgetPct: num(fd, "rewardBudgetPct"), commissionBudgetPct: num(fd, "commissionBudgetPct"), bonusPoolPct: num(fd, "bonusPoolPct"),
  };
  await prisma.companyGoal.upsert({ where: { period }, create: { period, ...data, createdBy: s.id }, update: data });
  await logAudit(prisma, { action: "COMPANY_GOAL_SAVED", entityId: period, entityType: "COMPANY_GOAL", performedBy: s.id, actorName: s.name, newValue: data });
  if (period.length === 7) await saveCompanyPerformance(period);
  revalidatePath("/goals/company");
}

/** Boss/Finance enter the manual score components (satisfaction, accuracy). */
export async function saveManualActuals(fd: FormData) {
  const s = await getSession();
  if (!s || (!isBoss(s.role) && s.role !== "FINANCE_ADMIN")) throw new Error("Only Boss / Finance can enter actuals.");
  const period = String(fd.get("period") ?? "");
  await prisma.companyPerformance.upsert({
    where: { period },
    create: { period, satisfactionPct: num(fd, "satisfactionPct"), accuracyPct: num(fd, "accuracyPct") },
    update: { satisfactionPct: num(fd, "satisfactionPct"), accuracyPct: num(fd, "accuracyPct") },
  });
  await saveCompanyPerformance(period);
  revalidatePath("/goals/company");
}

/** Boss approves the computed company score for the month. */
export async function approveCompanyScore(period: string) {
  const s = await bossActor();
  await saveCompanyPerformance(period);
  await prisma.companyPerformance.update({ where: { period }, data: { status: "APPROVED", approvedBy: s.id, approvedAt: new Date() } });
  await logAudit(prisma, { action: "COMPANY_SCORE_APPROVED", entityId: period, entityType: "COMPANY_PERFORMANCE", performedBy: s.id, actorName: s.name });
  revalidatePath("/goals/company");
}

/** Create/update one department's goal for a period. */
export async function saveDepartmentGoal(fd: FormData) {
  const s = await bossActor();
  const departmentId = String(fd.get("departmentId") ?? "");
  const period = String(fd.get("period") ?? "");
  if (!departmentId || !/^\d{4}-\d{2}$/.test(period)) throw new Error("Department and month are required.");
  const data = {
    jobVolumeTarget: Math.round(num(fd, "jobVolumeTarget")),
    revenueContributionTarget: num(fd, "revenueContributionTarget"),
    gpContributionTarget: num(fd, "gpContributionTarget"),
    kpiAchievementTargetPct: num(fd, "kpiAchievementTargetPct") || 100,
    accuracyTargetPct: num(fd, "accuracyTargetPct") || 95,
    speedTargetPct: num(fd, "speedTargetPct") || 90,
    proposalTarget: Math.round(num(fd, "proposalTarget")),
    notes: String(fd.get("notes") ?? "") || null,
  };
  await prisma.departmentGoal.upsert({
    where: { departmentId_period: { departmentId, period } },
    create: { departmentId, period, ...data, createdBy: s.id },
    update: data,
  });
  await saveDepartmentPerformance(departmentId, period);
  await logAudit(prisma, { action: "DEPARTMENT_GOAL_SAVED", entityId: departmentId, entityType: "DEPARTMENT_GOAL", performedBy: s.id, actorName: s.name, newValue: { period, ...data } });
  revalidatePath("/goals/departments");
}

/** Create/update a PositionKPI template. */
export async function savePositionKPI(fd: FormData) {
  const s = await bossActor();
  const id = String(fd.get("id") ?? "");
  const data = {
    name: String(fd.get("name") ?? "").trim(),
    departmentId: String(fd.get("departmentId") ?? "") || null,
    description: String(fd.get("description") ?? "") || null,
    minJobTarget: Math.round(num(fd, "minJobTarget")),
    zeroBandBelow: Math.round(num(fd, "zeroBandBelow")),
    cap110At: Math.round(num(fd, "cap110At")),
    commissionEligible: fd.get("commissionEligible") === "on",
    isActive: fd.get("isActive") !== "off",
  };
  if (!data.name) throw new Error("Position name is required.");
  if (id) await prisma.positionKPI.update({ where: { id }, data });
  else await prisma.positionKPI.create({ data });
  await logAudit(prisma, { action: "POSITION_KPI_SAVED", entityId: id || data.name, entityType: "POSITION_KPI", performedBy: s.id, actorName: s.name, newValue: data });
  revalidatePath("/goals/position-kpi");
}

/** Seed the five standard position templates from the management spec. */
export async function seedPositionDefaults() {
  const s = await bossActor();
  const departments = await prisma.department.findMany();
  const byName = (kw: string[]) => departments.find((d) => kw.some((k) => d.name.toLowerCase().includes(k)))?.id ?? null;
  const defaults = [
    {
      name: "Customer Service", departmentId: byName(["customer service", "cs"]), minJobTarget: 60, zeroBandBelow: 50, cap110At: 75,
      weightsJson: JSON.stringify({ "Company contribution": 10, "Customer inquiry handling": 15, "Job handling volume": 15, "Existing customer service": 15, "New lead handling": 10, "Customs inquiry / closing follow-up": 10, "Shipment update punctuality": 10, "Handover / document accuracy": 10, "Transloading coordination": 5, "Proposal / improvement": 5 }),
      rewardRulesJson: JSON.stringify([
        { label: "60 valid jobs, no major complaint", diamonds: 100 }, { label: "75 valid jobs with good quality", diamonds: 200 },
        { label: "Customer compliment", diamonds: 100 }, { label: "New lead converted (with sales support)", diamonds: 150 },
        { label: "Customs inquiry solved professionally", diamonds: 80 }, { label: "Closing risk prevented", diamonds: 100 },
        { label: "Transloading coordinated smoothly", diamonds: 100 }, { label: "Zero complaint month", diamonds: 200 }, { label: "Perfect handover month", diamonds: 150 },
      ]),
      deductionRulesJson: JSON.stringify([
        { label: "Below 60 valid jobs (no approved reason)", diamonds: -50 }, { label: "Below 50 valid jobs (no approved reason)", diamonds: -100 },
        { label: "Customer inquiry missed", diamonds: -20 }, { label: "Urgent inquiry ignored", diamonds: -50 },
        { label: "New lead not recorded", diamonds: -20 }, { label: "New lead not followed up", diamonds: -30 },
        { label: "Customs inquiry not escalated", diamonds: -50 }, { label: "Closing date missed (CS follow-up failure)", diamonds: -100 },
        { label: "Customer update missed", diamonds: -20 }, { label: "Customer chased due to no proactive update", diamonds: -30 },
        { label: "Wrong information given to customer", diamonds: -50 }, { label: "Handover incomplete causing delay", diamonds: -50 },
        { label: "Document collection mistake", diamonds: -50 }, { label: "Complaint caused by negligence", diamonds: -80 },
        { label: "Transloading instruction missed (cost/delay)", diamonds: -100 }, { label: "Hidden issue not reported", diamonds: -150 },
      ]),
    },
    {
      name: "Operation", departmentId: byName(["operation", "ops"]), minJobTarget: 80, zeroBandBelow: 65, cap110At: 100,
      weightsJson: JSON.stringify({ "Company contribution": 10, "Job handling volume": 20, "Booking / job coordination": 15, "Milestone update": 15, "Closing / ETA monitoring": 15, "Exception handling": 10, "No costly mistake": 10, "Teamwork": 3, "Proposal / improvement": 2 }),
      rewardRulesJson: JSON.stringify([
        { label: "80 valid jobs, no major mistake", diamonds: 120 }, { label: "100 valid jobs with good quality", diamonds: 250 },
        { label: "Zero missed closing / ETA issue", diamonds: 200 }, { label: "Urgent shipment solved", diamonds: 100 },
        { label: "Avoided storage / demurrage / detention", diamonds: 200 }, { label: "Zero operation error month", diamonds: 200 },
      ]),
      deductionRulesJson: JSON.stringify([
        { label: "Below 80 valid jobs (no approved reason)", diamonds: -60 }, { label: "Below 65 valid jobs (no approved reason)", diamonds: -120 },
        { label: "Job created wrongly", diamonds: -30 }, { label: "Booking missed / delayed (poor follow-up)", diamonds: -80 },
        { label: "Milestone update missed", diamonds: -20 }, { label: "Closing date missed (operation failure)", diamonds: -150 },
        { label: "ETA not monitored causing delay", diamonds: -100 }, { label: "Internal handover missed", diamonds: -50 },
        { label: "Exception not escalated", diamonds: -80 }, { label: "Extra cost from negligence", diamonds: -100 }, { label: "Hidden issue not reported", diamonds: -150 },
      ]),
    },
    {
      name: "Forwarding / Declaration", departmentId: byName(["forwarding", "declaration", "customs"]), minJobTarget: 120, zeroBandBelow: 90, cap110At: 150,
      weightsJson: JSON.stringify({ "Company contribution": 10, "Job handling volume": 20, "Declaration accuracy": 25, "Permit submission speed": 15, "HS code / duty checking": 15, "Customs release efficiency": 5, "No penalty / compound": 5, "Document control": 3, "Proposal / improvement": 2 }),
      rewardRulesJson: JSON.stringify([
        { label: "120 valid jobs, no major declaration error", diamonds: 150 }, { label: "150 valid jobs with good accuracy", diamonds: 300 },
        { label: "Zero declaration error month", diamonds: 250 }, { label: "Complex permit solved", diamonds: 150 },
        { label: "Customs query solved", diamonds: 150 }, { label: "HS code risk detected", diamonds: 200 },
        { label: "Prevented duty/tax mistake", diamonds: 200 }, { label: "Prevented customs penalty", diamonds: 300 },
      ]),
      deductionRulesJson: JSON.stringify([
        { label: "Below 120 valid jobs (no approved reason)", diamonds: -80 }, { label: "Below 90 valid jobs (no approved reason)", diamonds: -150 },
        { label: "K1/K2/K3/K8/ZB data entry mistake", diamonds: -50 }, { label: "HS code checking mistake", diamonds: -100 },
        { label: "Duty / tax calculation mistake", diamonds: -100 }, { label: "Permit submitted late (internal delay)", diamonds: -80 },
        { label: "Customs query not followed up", diamonds: -80 }, { label: "Missing supporting document", diamonds: -50 },
        { label: "Declaration error causing delay", diamonds: -100 }, { label: "Customs penalty / compound (negligence)", diamonds: -200 }, { label: "Hidden issue not reported", diamonds: -150 },
      ]),
    },
    {
      name: "Sales", departmentId: byName(["sales"]), minJobTarget: 0, zeroBandBelow: 0, cap110At: 0, commissionEligible: true,
      weightsJson: JSON.stringify({ "Company contribution": 10, "Personal GP achievement": 30, "New customer achievement": 20, "Quotation / follow-up discipline": 15, "Collection support": 10, "CRM completeness": 5, "Customer retention": 5, "Teamwork / handover quality": 5 }),
      rewardRulesJson: JSON.stringify([{ label: "GP target hit (see commission tiers)", diamonds: 0 }]),
      deductionRulesJson: JSON.stringify([
        { label: "Quotation not followed up", diamonds: -20 }, { label: "Lost deal reason not updated", diamonds: -10 },
        { label: "CRM incomplete", diamonds: -10 }, { label: "Wrong selling price causing loss", diamonds: -100 },
        { label: "Overpromise causing complaint", diamonds: -100 }, { label: "Handover to CS/Ops incomplete", diamonds: -50 },
        { label: "Payment issue not supported", diamonds: -30 },
      ]),
    },
    {
      name: "Finance", departmentId: byName(["finance", "account"]), minJobTarget: 0, zeroBandBelow: 0, cap110At: 0,
      weightsJson: JSON.stringify({ "Company contribution": 10, "Billing timeliness": 20, "Short billing control": 25, "Cost accuracy": 15, "Collection follow-up": 15, "Month-end closing": 10, "Proposal / improvement": 5 }),
      rewardRulesJson: JSON.stringify([
        { label: "Zero short billing month", diamonds: 250 }, { label: "Detected missing billing item", diamonds: 150 },
        { label: "Recovered overdue payment", diamonds: 150 }, { label: "Month-end closing on time", diamonds: 150 }, { label: "100% billing within deadline", diamonds: 200 },
      ]),
      deductionRulesJson: JSON.stringify([
        { label: "Invoice issued late", diamonds: -30 }, { label: "Cost entry mistake", diamonds: -30 },
        { label: "Short billing (negligence)", diamonds: -150 }, { label: "Missing disbursement billing", diamonds: -100 },
        { label: "Collection follow-up not updated", diamonds: -50 }, { label: "Wrong payment update", diamonds: -50 }, { label: "Month-end closing delayed", diamonds: -80 },
      ]),
    },
  ];
  let created = 0;
  for (const d of defaults) {
    await prisma.positionKPI.upsert({ where: { name: d.name }, create: d, update: {} }); // never overwrite boss edits
    created++;
  }
  await logAudit(prisma, { action: "POSITION_KPI_SEEDED", entityId: "defaults", entityType: "POSITION_KPI", performedBy: s.id, actorName: s.name });
  revalidatePath("/goals/position-kpi");
  return { created };
}
