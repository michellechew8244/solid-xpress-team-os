import { prisma } from "./prisma";
import { currentPeriod } from "./enums";
import { PROFILE_RESULT_AREAS } from "./result-data";

export * from "./result-data";

/**
 * Result-oriented KPI engine.
 *
 * Tasks are only evidence — RESULTS are the KPI. Staff are rewarded when
 * their work creates outcomes (customer served, shipment completed, closing
 * protected, GP protected...), never for raw task counts. Job/case counts
 * remain as WORKLOAD indicators for fairness and capacity planning only.
 */

// ---------------------------------------------------------------------------
// Core formula weights: Individual Score =
// Business Result 40% + Customer/Internal Outcome 25% + Accuracy & Risk 20% +
// Contribution/Improvement 10% + Discipline 5%.
// ---------------------------------------------------------------------------
const monthWindow = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return { gte: new Date(Date.UTC(y, (m || 1) - 1, 1)), lt: new Date(Date.UTC(y, m || 1, 1)) };
};

// ---------------------------------------------------------------------------
// Inquiry resolution: resolved assigned / due assigned (assigned-only rule).
// ---------------------------------------------------------------------------
export interface InquiryOutcome { assigned: number; due: number; resolved: number; overdue: number; ratePct: number }

export async function inquiryResolution(userId: string, period = currentPeriod()): Promise<InquiryOutcome> {
  const w = monthWindow(period);
  const rows = await prisma.assignedInquiry.findMany({
    where: { assignedToId: userId, createdAt: { gte: w.gte, lt: w.lt } },
    select: { status: true, dueAt: true, closedAt: true },
  });
  const now = new Date();
  // "Due" = past due date or already closed; open-not-yet-due doesn't count against staff.
  const due = rows.filter((r) => r.status !== "OPEN" || (r.dueAt && r.dueAt < now));
  const resolved = rows.filter((r) => r.status === "RESOLVED" || r.status === "LOST"); // LOST with recorded reason = properly closed
  const overdue = rows.filter((r) => ["OPEN", "IN_PROGRESS"].includes(r.status) && r.dueAt && r.dueAt < now);
  const ratePct = due.length === 0 ? 100 : Math.round((resolved.length / due.length) * 100);
  return { assigned: rows.length, due: due.length, resolved: resolved.length, overdue: overdue.length, ratePct: Math.min(ratePct, 120) };
}

// ---------------------------------------------------------------------------
// Result areas score for one user: avg finalResultScore per area × weights.
// ---------------------------------------------------------------------------
export interface AreaScore { area: string; weight: number; score: number | null; records: number }
export interface ResultBreakdown {
  profileType: string | null;
  areas: AreaScore[];
  resultScore: number;      // 0-120 weighted across areas with data
  recordCount: number;
  avgQualityGate: number;   // avg gate across approved records
  inquiry: InquiryOutcome;
}

export async function profileForUser(userId: string): Promise<string | null> {
  const cs = await prisma.cSRoleProfile.findUnique({ where: { userId } });
  if (cs?.isActive) return cs.profileType;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { department: { select: { name: true } } } });
  const dn = u?.department?.name?.toLowerCase() ?? "";
  if (dn.includes("operation") || dn.includes("ops")) return "OPERATION";
  if (dn.includes("forwarding") || dn.includes("declaration") || dn.includes("customs")) return "FORWARDING";
  if (dn.includes("customer") || dn === "cs") return "CS_HYBRID";
  return null;
}

export async function resultBreakdown(userId: string, period = currentPeriod()): Promise<ResultBreakdown> {
  const [profileType, records, inquiry] = await Promise.all([
    profileForUser(userId),
    prisma.resultRecord.findMany({ where: { userId, period, resultStatus: "APPROVED" }, select: { resultArea: true, finalResultScore: true, qualityGatePercent: true } }),
    inquiryResolution(userId, period),
  ]);
  const areaDefs = PROFILE_RESULT_AREAS[profileType ?? ""] ?? [];
  const byArea = new Map<string, number[]>();
  for (const r of records) {
    const key = r.resultArea ?? "General";
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key)!.push(r.finalResultScore);
  }

  const areas: AreaScore[] = areaDefs.map((d) => {
    let vals = byArea.get(d.area) ?? [];
    // Inquiry areas are auto-scored from assigned-inquiry resolution when no manual records exist.
    if (vals.length === 0 && d.area.toLowerCase().includes("inquiry") && inquiry.due > 0) vals = [inquiry.ratePct];
    return { area: d.area, weight: d.weight, score: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null, records: vals.length };
  });

  // Weighted score across areas WITH data (unmeasured areas don't punish staff early on).
  const withData = areas.filter((a) => a.score !== null);
  const wSum = withData.reduce((s, a) => s + a.weight, 0);
  const resultScore = wSum === 0 ? 0 : Math.round(withData.reduce((s, a) => s + (a.score! * a.weight), 0) / wSum);
  const avgQualityGate = records.length ? Math.round(records.reduce((s, r) => s + r.qualityGatePercent, 0) / records.length) : 100;

  return { profileType, areas, resultScore: Math.min(resultScore, 120), recordCount: records.length, avgQualityGate, inquiry };
}

// ---------------------------------------------------------------------------
// Workload indicator (case credits + valid jobs) — fairness only.
// ---------------------------------------------------------------------------
export interface Workload { validJobs: number; caseCredits: number; benchmark: number; status: "OVERLOADED" | "BALANCED" | "UNDERLOADED" }

export async function workloadIndicator(userId: string, period = currentPeriod()): Promise<Workload> {
  const [jobs, credits, csProfile] = await Promise.all([
    prisma.jobHandlingRecord.findMany({ where: { userId, jobMonth: period, isValidForKPI: true, status: { in: ["COMPLETED", "IN_PROGRESS"] } }, select: { jobType: true } }),
    prisma.caseCreditSetting.findMany({ where: { isActive: true } }),
    prisma.cSRoleProfile.findUnique({ where: { userId } }),
  ]);
  const creditByType = new Map(credits.map((c) => [c.workType, c.baseCredit]));
  // Map job handling types onto case-credit work types where names align; default 1.
  const JOB_TO_CREDIT: Record<string, string> = {
    EXISTING_CUSTOMER_SHIPMENT: "SIMPLE_INQUIRY", NEW_LEAD_INQUIRY: "NEW_LEAD_INQUIRY", CUSTOMS_INQUIRY_FOLLOWUP: "CUSTOMS_INQUIRY_COORD",
    CLOSING_DATE_FOLLOWUP: "CLOSING_DATE_CONTROL", SHIPMENT_STATUS_UPDATE: "SIMPLE_INQUIRY", DOCUMENT_COLLECTION: "DRAFT_BL_CHECK",
    COMPLAINT_HANDLING: "COMPLAINT_HANDLING", TRANSLOADING_COORDINATION: "TRANSLOADING_SIMPLE", INTERNAL_HANDOVER: "OPEN_JOB",
    BOOKING_COORDINATION: "BOOKING_BC", JOB_CREATION: "OPEN_JOB", MILESTONE_UPDATE: "SIMPLE_INQUIRY", CLOSING_DATE_MONITORING: "CLOSING_DATE_CONTROL",
    PERMIT_SUBMISSION: "CLEARANCE_COORDINATION", CUSTOMS_RELEASE_FOLLOWUP: "CLEARANCE_COORDINATION", CUSTOMS_QUERY_RESPONSE: "CUSTOMS_INQUIRY_COORD",
  };
  const caseCredits = Math.round(jobs.reduce((s, j) => s + (creditByType.get(JOB_TO_CREDIT[j.jobType] ?? "") ?? 1), 0) * 10) / 10;
  const benchmark = csProfile?.monthlyWorkloadBenchmark ?? 0;
  let status: Workload["status"] = "BALANCED";
  if (benchmark > 0) {
    if (caseCredits > benchmark * 1.2) status = "OVERLOADED";
    else if (caseCredits < benchmark * 0.6) status = "UNDERLOADED";
  }
  return { validJobs: jobs.length, caseCredits, benchmark, status };
}

/** Persist the monthly workload snapshot (upsert). */
export async function saveWorkloadIndicator(userId: string, period = currentPeriod()) {
  const w = await workloadIndicator(userId, period);
  return prisma.workloadIndicator.upsert({
    where: { userId_month: { userId, month: period } },
    create: { userId, month: period, validJobCount: w.validJobs, caseCreditTotal: w.caseCredits, workloadStatus: w.status, overloadFlag: w.status === "OVERLOADED", underloadFlag: w.status === "UNDERLOADED" },
    update: { validJobCount: w.validJobs, caseCreditTotal: w.caseCredits, workloadStatus: w.status, overloadFlag: w.status === "OVERLOADED", underloadFlag: w.status === "UNDERLOADED" },
  });
}
