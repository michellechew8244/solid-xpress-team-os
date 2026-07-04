import { prisma } from "./prisma";
import { currentPeriod } from "./enums";
import {
  computeCompanyPerformance, computeDepartmentPerformance, computeIndividualPerformance,
  coachingTriggers, COMPANY_WEIGHTS,
} from "./performance";
import { collectedGPForUser } from "./commission";

/**
 * AI Performance Coach — data-grounded analysis generators.
 *
 * Every figure comes straight from the database; nothing is invented. When
 * data is missing the text says so. The coach analyses, suggests and drafts —
 * it NEVER approves commission, bonus, deductions, diamonds, attendance or
 * promotion; those stay with authorised humans.
 */

export const DISCLAIMER = "\n\n—\n_AI analysis based on app data as of now. Facts above come from recorded figures; suggestions are advisory. Please review before acting — final decisions stay with authorised approvers._";

const pct = (n: number) => `${Math.round(n)}%`;
const rm = (n: number) => `RM ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

async function log(analysisType: string, month: string, outputText: string, generatedBy: string, extra: { userId?: string; departmentId?: string } = {}) {
  await prisma.aIAnalysisLog.create({ data: { analysisType, month, outputText, generatedBy, ...extra } });
}

/** 1. Company performance analysis (Boss). */
export async function generateCompanyPerformanceAnalysis(month = currentPeriod(), generatedBy = "system"): Promise<string> {
  const c = await computeCompanyPerformance(month);
  const departments = await prisma.department.findMany({ where: { status: "ACTIVE" } });
  const deptScores = await Promise.all(departments.map(async (d) => ({ name: d.name, ...(await computeDepartmentPerformance(d.id, month)) })));
  deptScores.sort((a, b) => a.score - b.score);

  const weak = deptScores.filter((d) => d.score < 75);
  const strong = deptScores.filter((d) => d.score >= 90);
  const componentsSorted = (Object.keys(c.achievements) as (keyof typeof COMPANY_WEIGHTS)[]).sort((a, b) => c.achievements[a] - c.achievements[b]);
  const worst = componentsSorted.slice(0, 3);

  const lines = [
    `## 🏢 Company Performance — ${month}`,
    ``,
    `**Facts (from recorded data):**`,
    `- Company score: **${c.score} (grade ${c.grade}, bonus multiplier ×${c.multiplier})**${c.hasGoal ? "" : " — ⚠️ no company goal set for this month, so achievement is measured against empty targets"}`,
    `- Revenue ${rm(c.actuals.revenue)} (${pct(c.achievements.revenue)} of target) · GP ${rm(c.actuals.gp)} (${pct(c.achievements.grossProfit)}) · Collection ${rm(c.actuals.collection)} (${pct(c.achievements.collection)})`,
    `- Attendance discipline ${pct(c.actuals.attendancePct)} · Short-billing control ${pct(c.actuals.shortBillingControlPct)} · Accepted proposals: ${c.actuals.proposalCount}`,
    c.actuals.satisfactionPct === 0 ? `- Customer satisfaction: **data missing** (enter it on the Company Goal Centre page)` : `- Customer satisfaction ${pct(c.actuals.satisfactionPct)}`,
    ``,
    `**Weakest components:** ${worst.map((k) => `${k} (${pct(c.achievements[k])})`).join(", ")}`,
    weak.length ? `**Departments needing attention (<75):** ${weak.map((d) => `${d.name} (${d.score})`).join(", ")}` : `**Departments:** none below 75 — solid.`,
    strong.length ? `**Strong departments (≥90):** ${strong.map((d) => `${d.name} (${d.score})`).join(", ")}` : ``,
    ``,
    `**Suggested management focus for next week:**`,
    ...worst.map((k) => `- Lift **${k}**: it carries ${COMPANY_WEIGHTS[k]}% of the company score and is currently at ${pct(c.achievements[k])}.`),
    ...(weak.length ? [`- Review ${weak[0].name}'s job volume (${weak[0].validJobs}${weak[0].jobTarget ? `/${weak[0].jobTarget}` : ""}) and accuracy with its head.`] : []),
  ].filter(Boolean);
  const text = lines.join("\n") + DISCLAIMER;
  await log("COMPANY", month, text, generatedBy);
  return text;
}

/** 2. Department analysis + comparison (Boss / Dept Head). */
export async function generateDepartmentPerformanceAnalysis(departmentId: string, month = currentPeriod(), generatedBy = "system"): Promise<string> {
  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept) return "Department not found.";
  const d = await computeDepartmentPerformance(departmentId, month);
  const members = await prisma.user.findMany({ where: { departmentId, isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] } }, select: { id: true, name: true } });

  const rows: { name: string; score: number; jobs: number; target: number; triggers: string[] }[] = [];
  for (const mem of members) {
    const ind = await computeIndividualPerformance(mem.id, month);
    const trig = await coachingTriggers(mem.id, month);
    rows.push({ name: mem.name, score: ind.score, jobs: ind.validJobs, target: ind.jobTarget, triggers: trig });
  }
  rows.sort((a, b) => b.score - a.score);
  const below = rows.filter((r) => r.target > 0 && r.jobs < r.target);
  const risky = rows.filter((r) => r.triggers.length > 0);
  const top = rows.slice(0, 3);

  const lines = [
    `## 🏬 ${dept.name} — ${month}`,
    ``,
    `**Facts:** score **${d.score} (grade ${d.grade})** · valid jobs ${d.validJobs}${d.jobTarget ? `/${d.jobTarget}` : " (no volume target set)"} · KPI ${pct(d.components.kpi)} · accuracy ${pct(d.components.accuracy)} · attendance ${pct(d.components.attendance)} · proposals ${pct(d.components.proposals)}`,
    members.length === 0 ? `\n**No active staff in this department.**` : ``,
    top.length ? `\n**Top contributors:** ${top.map((r) => `${r.name} (${r.score})`).join(", ")}` : ``,
    below.length ? `**Below job target:** ${below.map((r) => `${r.name} (${r.jobs}/${r.target})`).join(", ")}` : `**Job targets:** everyone with a target is on track.`,
    risky.length ? `\n**Staff needing support:**\n${risky.map((r) => `- ${r.name}: ${r.triggers.join(" ")}`).join("\n")}` : `\n**Coaching flags:** none this month.`,
    ``,
    `**Suggested actions:**`,
    ...(below.length ? [`- Check workload distribution — ${below.length} staff below the valid-job minimum; confirm whether jobs are unlogged or genuinely low volume.`] : []),
    ...(d.components.accuracy < 95 ? [`- Run an error review: accuracy ${pct(d.components.accuracy)} vs the 95% standard.`] : []),
    ...(d.components.proposals < 100 ? [`- Encourage at least one improvement proposal — it lifts both the department score and individual scores.`] : []),
    `- Recognise the top contributor publicly on the Achievement Wall / ceremony.`,
  ];
  const text = lines.filter(Boolean).join("\n") + DISCLAIMER;
  await log("DEPARTMENT", month, text, generatedBy, { departmentId });
  return text;
}

/** 3. Staff self-analysis: my score, my deductions, how to earn more. */
export async function generateStaffPerformanceAnalysis(userId: string, month = currentPeriod(), generatedBy = "system"): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, currentPoints: true } });
  if (!user) return "User not found.";
  const ind = await computeIndividualPerformance(userId, month);
  const [earned, deducted, deductions] = await Promise.all([
    prisma.pointsTransaction.aggregate({ where: { userId, period: month, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.pointsTransaction.aggregate({ where: { userId, period: month, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.pointsTransaction.findMany({ where: { userId, period: month, amount: { lt: 0 } }, orderBy: { amount: "asc" }, take: 5, select: { reason: true, amount: true } }),
  ]);

  const comp = ind.components;
  const weakest = (Object.entries(comp) as [string, number][]).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const actions: string[] = [];
  if (ind.jobTarget > 0 && ind.validJobs < ind.jobTarget) actions.push(`Log and complete ${ind.jobTarget - ind.validJobs} more valid jobs to hit your ${ind.jobTarget}-job minimum (currently ${ind.validJobs}).`);
  if (comp.proposals < 100) actions.push(`Submit one improvement proposal — an accepted idea is +100 💎 and boosts your proposal component (now ${pct(comp.proposals)}).`);
  if (comp.attendance < 100) actions.push(`Protect your attendance streak — on-time check-ins raise your discipline score (now ${pct(comp.attendance)}).`);
  if (comp.learning < 100) actions.push(`Finish one training in the Training Centre to lift your learning score (now ${pct(comp.learning)}).`);
  if (comp.accuracy < 100) actions.push(`Reduce errors: your accuracy component is ${pct(comp.accuracy)} — double-check documents/handovers before submitting.`);
  while (actions.length < 3) actions.push("Keep your current pace — claim missions in the Game Centre for extra diamonds.");

  const lines = [
    `## 👤 ${user.name} — My Performance (${month})`,
    ``,
    `**Facts:**`,
    `- Monthly score: **${ind.score} (grade ${ind.grade})**${ind.positionName ? ` · position: ${ind.positionName}` : ""}`,
    ind.jobTarget > 0 ? `- Valid jobs: **${ind.validJobs}/${ind.jobTarget}** (volume score ${pct(ind.jobVolumePct)})` : `- Valid jobs logged: ${ind.validJobs} (no minimum target for your position)`,
    `- Diamonds this month: **+${earned._sum.amount ?? 0} / −${Math.abs(deducted._sum.amount ?? 0)}** · wallet ${user.currentPoints.toLocaleString()} 💎`,
    deductions.length ? `- Biggest deductions: ${deductions.map((d) => `${d.reason} (${d.amount})`).join("; ")}` : `- No deductions this month 🎉`,
    ``,
    `**Weakest components:** ${weakest.map(([k, v]) => `${k} ${pct(v)}`).join(" · ")}`,
    ``,
    `**Your next 3 actions:**`,
    ...actions.slice(0, 3).map((a, i) => `${i + 1}. ${a}`),
  ];
  const text = lines.join("\n") + DISCLAIMER;
  await log("STAFF", month, text, generatedBy, { userId });
  return text;
}

/** 4. Coaching suggestion for a staff member (Dept Head). */
export async function generateCoachingSuggestion(userId: string, month = currentPeriod(), generatedBy = "system"): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return "User not found.";
  const [ind, triggers] = await Promise.all([computeIndividualPerformance(userId, month), coachingTriggers(userId, month)]);
  const lines = [
    `## 🎓 Coaching draft — ${user.name} (${month})`,
    ``,
    triggers.length ? `**Issues (facts):**\n${triggers.map((t) => `- ${t}`).join("\n")}` : `**No automatic coaching triggers.** Score ${ind.score} (${ind.grade}). Use this draft for growth coaching instead of corrective coaching.`,
    ``,
    `**Suggested coaching message (edit before sending):**`,
    `> Hi ${user.name.split(" ")[0]}, thanks for your work this month. I want to support you on ${triggers.length ? "a few things I noticed" : "your next growth step"}:`,
    ...(triggers.length ? triggers.map((t) => `> • ${t}`) : [`> • Your score is ${ind.score} — let's plan how to reach the next grade.`]),
    `> What support do you need from me? Let's agree an improvement action and check in again on {date}.`,
    ``,
    `**Structure:** issue → expectation → support offered → deadline. Keep it factual and supportive, not punitive.`,
  ];
  const text = lines.join("\n") + DISCLAIMER;
  await log("COACHING", month, text, generatedBy, { userId });
  return text;
}

/** 5. Monthly Boss report: improved/dropped/reward/coach/focus. */
export async function generateMonthlyBossReport(month = currentPeriod(), generatedBy = "system"): Promise<string> {
  const c = await computeCompanyPerformance(month);
  // previous month
  const [y, m] = month.split("-").map(Number);
  const prevMonth = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const p = await computeCompanyPerformance(prevMonth);

  const departments = await prisma.department.findMany({ where: { status: "ACTIVE" } });
  const deptNow = await Promise.all(departments.map(async (d) => ({ name: d.name, id: d.id, now: (await computeDepartmentPerformance(d.id, month)).score, prev: (await computeDepartmentPerformance(d.id, prevMonth)).score })));
  const improved = deptNow.filter((d) => d.now > d.prev + 2).sort((a, b) => (b.now - b.prev) - (a.now - a.prev));
  const dropped = deptNow.filter((d) => d.now < d.prev - 2).sort((a, b) => (a.now - a.prev) - (b.now - b.prev));

  const staff = await prisma.user.findMany({ where: { isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] }, NOT: { email: { endsWith: "@solidxpress.system" } } }, select: { id: true, name: true } });
  const scored: { name: string; score: number; triggers: string[] }[] = [];
  for (const st of staff) {
    const ind = await computeIndividualPerformance(st.id, month);
    scored.push({ name: st.name, score: ind.score, triggers: await coachingTriggers(st.id, month) });
  }
  scored.sort((a, b) => b.score - a.score);
  const reward = scored.slice(0, 3).filter((s) => s.score >= 80);
  const coach = scored.filter((s) => s.triggers.length > 0).slice(0, 5);

  const lines = [
    `## 📊 Boss Monthly Report — ${month}`,
    ``,
    `**Company:** score ${c.score} (${c.grade}, ×${c.multiplier}) vs ${p.score} last month → ${c.score >= p.score ? `improved +${(c.score - p.score).toFixed(1)}` : `dropped ${(c.score - p.score).toFixed(1)}`}.`,
    `Revenue ${rm(c.actuals.revenue)} · GP ${rm(c.actuals.gp)} · Collected ${rm(c.actuals.collection)} · Proposals ${c.actuals.proposalCount}.`,
    ``,
    improved.length ? `**What improved:** ${improved.map((d) => `${d.name} (${d.prev}→${d.now})`).join(", ")}` : `**What improved:** no department moved up materially vs last month.`,
    dropped.length ? `**What dropped:** ${dropped.map((d) => `${d.name} (${d.prev}→${d.now})`).join(", ")}` : `**What dropped:** no material drops.`,
    ``,
    reward.length ? `**Who to reward:** ${reward.map((s) => `${s.name} (${s.score})`).join(", ")} — consider Mystery Bonus or ceremony recognition.` : `**Who to reward:** no one above 80 this month — review targets or data completeness.`,
    coach.length ? `**Who needs coaching:**\n${coach.map((s) => `- ${s.name}: ${s.triggers[0]}`).join("\n")}` : `**Who needs coaching:** no automatic flags.`,
    ``,
    `**Focus next month:**`,
    ...(dropped.length ? [`- Sit with ${dropped[0].name} head — biggest drop.`] : []),
    ...(c.actuals.satisfactionPct === 0 ? [`- Customer satisfaction data is missing — start recording it for a complete score.`] : []),
    `- Confirm all departments have goals set for next month in the Department KPI Centre.`,
  ];
  const text = lines.filter(Boolean).join("\n") + DISCLAIMER;
  await log("BOSS_MONTHLY", month, text, generatedBy);
  return text;
}

/** 6. Risk detection: commission/bonus/billing/deduction risks (Boss/Finance). */
export async function detectPerformanceRisk(month = currentPeriod(), generatedBy = "system"): Promise<string> {
  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m || 1, 1));

  const [shortBilled, unbilled, uncollected, heldCommissions, spikes] = await Promise.all([
    prisma.financeRecord.count({ where: { shortBilling: true, createdAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.job.count({ where: { billingStatus: "UNBILLED", status: { in: ["CLOSED"] } } }),
    prisma.financeRecord.findMany({ where: { invoiceIssued: true, paymentCollected: false }, select: { grossProfit: true } }),
    prisma.commissionRecord.findMany({ where: { period: month, status: "HELD" }, select: { userId: true, holdReason: true } }),
    prisma.pointsTransaction.groupBy({ by: ["userId"], where: { period: month, amount: { lt: 0 } }, _sum: { amount: true } }),
  ]);
  const uncollectedGP = uncollected.reduce((s, f) => s + f.grossProfit, 0);
  const bigDeductors = spikes.filter((s) => Math.abs(s._sum.amount ?? 0) >= 100);
  const names = bigDeductors.length ? await prisma.user.findMany({ where: { id: { in: bigDeductors.map((b) => b.userId) } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));

  const lines = [
    `## 🚨 Risk Detection — ${month}`,
    ``,
    `- Short-billing flags this month: **${shortBilled}**${shortBilled ? " ⚠️ review with Finance" : " ✅"}`,
    `- Closed jobs still unbilled: **${unbilled}**${unbilled ? " ⚠️ billing leakage risk" : " ✅"}`,
    `- GP invoiced but not collected: **${rm(uncollectedGP)}**${uncollectedGP > 0 ? " — commission on these jobs should stay held" : ""}`,
    heldCommissions.length ? `- Held commissions: ${heldCommissions.map((h) => h.holdReason).join("; ")}` : `- Held commissions: none`,
    bigDeductors.length ? `- Deduction spikes (≥100 💎): ${bigDeductors.map((b) => `${nameById.get(b.userId) ?? b.userId} (${b._sum.amount})`).join(", ")}` : `- Deduction spikes: none`,
  ];
  const text = lines.join("\n") + DISCLAIMER;
  await log("RISK", month, text, generatedBy);
  return text;
}

/** 7. KPI-setting expertise advisor: audits a department's KPI setup and
 *  recommends targets grounded in the last 3 months of actuals + freight-
 *  forwarding best practice. */
export async function generateKPISettingAdvice(departmentId: string, month = currentPeriod(), generatedBy = "system"): Promise<string> {
  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept) return "Department not found.";

  // Last 3 periods for actuals-grounded target suggestions.
  const [y, m] = month.split("-").map(Number);
  const periods: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.UTC(y, (m || 1) - 1 - i, 1));
    periods.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const [kpis, results, position, goal, memberCount] = await Promise.all([
    prisma.kPI.findMany({ where: { departmentId, status: "ACTIVE" } }),
    prisma.kPIResult.findMany({ where: { period: { in: periods }, kpi: { departmentId } }, select: { kpiId: true, achievementPct: true } }),
    prisma.positionKPI.findFirst({ where: { departmentId, isActive: true } }),
    prisma.departmentGoal.findUnique({ where: { departmentId_period: { departmentId, period: month } } }),
    prisma.user.count({ where: { departmentId, isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] } } }),
  ]);

  // Best-practice KPI categories per department type (freight forwarding).
  const name = dept.name.toLowerCase();
  const expected: string[] =
    name.includes("sales") ? ["GP achievement", "New customers", "Quotation follow-up", "Collection support", "Retention"]
    : name.includes("customer") || name === "cs" ? ["Job volume (60/staff)", "Inquiry response time", "Existing customer service", "New lead handling", "Customs/closing follow-up", "Update punctuality", "Handover accuracy"]
    : name.includes("operation") ? ["Job volume (80/staff)", "Booking coordination", "Milestone updates", "Closing/ETA monitoring", "Exception handling", "Zero costly mistakes"]
    : name.includes("forwarding") || name.includes("declaration") ? ["Job volume (120/staff)", "Declaration accuracy", "Permit speed", "HS/duty checking", "Release efficiency", "Zero penalties"]
    : name.includes("finance") || name.includes("account") ? ["Billing timeliness", "Short-billing control", "Cost accuracy", "Collection follow-up", "Month-end closing"]
    : ["Job/task volume", "Accuracy", "Speed/SLA", "Cost control", "Teamwork", "Improvement proposals"];

  // Audit existing KPIs.
  const totalWeight = kpis.reduce((s, k) => s + k.weightage, 0);
  const avgByKpi = new Map<string, number[]>();
  for (const r of results) { (avgByKpi.get(r.kpiId) ?? avgByKpi.set(r.kpiId, []).get(r.kpiId)!).push(r.achievementPct); }
  const kpiLines = kpis.map((k) => {
    const vals = avgByKpi.get(k.id) ?? [];
    const avg = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    let verdict = "no results yet — set a first-month baseline target and adjust after one cycle";
    if (avg !== null) {
      if (avg >= 115) verdict = `avg ${avg}% — too easy; raise the target ~${Math.round((avg - 100))}% so 100% means real stretch`;
      else if (avg >= 85) verdict = `avg ${avg}% — well calibrated; keep the target, tighten only if it stays >110% for 2 more months`;
      else if (avg >= 60) verdict = `avg ${avg}% — stretch is high; check whether it's a capability gap (coach) or an unrealistic target (reduce ~10-15%)`;
      else verdict = `avg ${avg}% — demotivating; a target nobody reaches stops driving behaviour. Cut it to ~${Math.round((avg * 1.15))}% of current and rebuild momentum`;
    }
    return `- **${k.name}** (weight ${k.weightage}, target ${k.targetValue}${k.unit ? ` ${k.unit}` : ""}): ${verdict}`;
  });

  const covered = kpis.map((k) => k.name.toLowerCase());
  const missing = expected.filter((e) => !covered.some((c) => e.toLowerCase().split(" ")[0] && c.includes(e.toLowerCase().split(" ")[0].replace(/[^a-z]/g, ""))));

  const lines = [
    `## 🎯 KPI Setting Advice — ${dept.name} (${month})`,
    ``,
    `**Current setup (facts):** ${kpis.length} active KPIs · combined weight ${totalWeight} · ${memberCount} active staff` +
      (position ? ` · position template "${position.name}" (min ${position.minJobTarget} jobs/month)` : " · ⚠️ no position template linked") +
      (goal ? ` · month goal set (${goal.jobVolumeTarget} jobs)` : " · ⚠️ no department goal set for this month"),
    ``,
    kpis.length === 0 ? `**No KPIs defined yet.** Start with 4–6 KPIs from the best-practice list below — more than 8 dilutes focus.` : `**KPI-by-KPI audit (grounded in the last 3 months of results):**\n${kpiLines.join("\n")}`,
    ``,
    missing.length ? `**Best-practice areas not yet covered:** ${missing.join(" · ")}` : `**Coverage:** all core best-practice areas for this department type are covered. ✅`,
    ``,
    `**Expert principles for good KPI setting (freight forwarding):**`,
    `1. **SMART + controllable** — staff must be able to influence the number by their own actions (e.g. "shipment updates sent on time %", not "port congestion days").`,
    `2. **Balance volume with quality** — every volume KPI (jobs handled) needs a paired accuracy/complaint KPI, or you reward careless speed.`,
    `3. **Set targets from actuals** — target ≈ recent 3-month average × 1.10 for growth KPIs; ≥95–100% for accuracy/compliance KPIs. Never guess.`,
    `4. **Weight what matters** — the top 2 KPIs should carry ≥50% of total weight; a 5%-weight KPI won't change behaviour.`,
    `5. **Monthly rhythm** — review in week 1, mid-month check-in, score in week 4. A KPI nobody discusses is decoration.`,
    `6. **Link to money and growth** — this app already links KPI → diamonds → bonus pool → commission → promotion; make sure every staff member can explain that chain for their own KPIs.`,
    ``,
    `**Suggested next actions:**`,
    ...(goal ? [] : [`- Set ${dept.name}'s job volume & proposal targets for ${month} in the Department KPI Centre.`]),
    ...(position ? [] : [`- Link a Position KPI template to this department in Position KPI Setup so job-volume banding applies.`]),
    ...(kpis.length > 8 ? [`- Trim to the 6–8 highest-impact KPIs; merge overlapping ones.`] : []),
    ...(missing.length ? [`- Add a KPI for: ${missing[0]}.`] : []),
    `- Re-run this advice next month — recommendations recalibrate automatically as results come in.`,
  ];
  const text = lines.filter(Boolean).join("\n") + DISCLAIMER;
  await log("KPI_ADVICE", month, text, generatedBy, { departmentId });
  return text;
}

/** 8. Sales commission risk brief for one user. */
export async function generateCommissionRiskBrief(userId: string, month = currentPeriod()): Promise<string> {
  const gp = await collectedGPForUser(userId, month);
  return [
    `Collected GP ${rm(gp.collectedGP)} · awaiting collection ${rm(gp.uncollectedGP)} · loss-making jobs excluded: ${gp.lossMakingJobs}.`,
    gp.uncollectedGP > 0 ? `⚠️ ${rm(gp.uncollectedGP)} of GP is not collected yet — commission on it must be held until Finance confirms payment.` : `✅ No uncollected GP outstanding.`,
  ].join("\n");
}
