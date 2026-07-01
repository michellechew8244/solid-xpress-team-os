/**
 * Centralised enum-like constants. SQLite has no native enums, so allowed
 * values live here and are reused across seed, API and UI for consistency.
 */

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  MANAGEMENT: "MANAGEMENT",
  DEPARTMENT_HEAD: "DEPARTMENT_HEAD",
  STAFF: "STAFF",
  HR_ADMIN: "HR_ADMIN",
  FINANCE_ADMIN: "FINANCE_ADMIN",
} as const;
export type Role = keyof typeof ROLES;

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin / Boss",
  MANAGEMENT: "Management",
  DEPARTMENT_HEAD: "Department Head",
  STAFF: "Staff",
  HR_ADMIN: "HR Admin",
  FINANCE_ADMIN: "Finance Admin",
};

export const TASK_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_EXTERNAL: "WAITING_EXTERNAL",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
  OVERDUE: "OVERDUE",
} as const;

export const TASK_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING_EXTERNAL: "Waiting external",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  OVERDUE: "Overdue",
};

export const TASK_PRIORITY = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const TASK_TYPES = [
  "DAILY",
  "WEEKLY",
  "SPECIAL_PROJECT",
  "CUSTOMER_ISSUE",
  "SHIPMENT_ISSUE",
  "FINANCE_ISSUE",
  "SALES_FOLLOWUP",
  "PERMIT_FOLLOWUP",
  "HAULAGE_FOLLOWUP",
  "RUNNER_TASK",
  "MANAGEMENT_INSTRUCTION",
] as const;

export const JOB_MODES = [
  "SEA",
  "AIR",
  "LAND",
  "FORWARDING",
  "HAULAGE",
  "WAREHOUSE",
  "TRANSLOADING",
  "COURIER",
] as const;

// Ordered shipment lifecycle milestones (section E).
export const MILESTONES: { stage: string; label: string }[] = [
  { stage: "JOB_CREATED", label: "Job created" },
  { stage: "BOOKING_CONFIRMED", label: "Booking confirmed" },
  { stage: "DOCS_RECEIVED", label: "Documents received" },
  { stage: "PERMIT_SUBMITTED", label: "Permit submitted" },
  { stage: "PERMIT_APPROVED", label: "Permit approved" },
  { stage: "DECLARATION_SUBMITTED", label: "Declaration submitted" },
  { stage: "CUSTOMS_RELEASED", label: "Customs released" },
  { stage: "DO_COLLECTED", label: "DO collected" },
  { stage: "HAULAGE_ARRANGED", label: "Haulage arranged" },
  { stage: "CARGO_PICKED_UP", label: "Cargo picked up" },
  { stage: "CARGO_DELIVERED", label: "Cargo delivered" },
  { stage: "INVOICE_ISSUED", label: "Invoice issued" },
  { stage: "PAYMENT_COLLECTED", label: "Payment collected" },
  { stage: "JOB_CLOSED", label: "Job closed" },
];

export const POINTS_TYPES = [
  "TASK",
  "KPI",
  "COMPLIMENT",
  "TEAMWORK",
  "PROBLEM_SOLVED",
  "SALES",
  "COST_SAVING",
  "PENALTY_PREVENTED",
  "SOP",
  "MENTORING",
  "CONTENT",
  "ZERO_MISTAKE",
  "PENALTY",
  "REDEMPTION",
  "MANUAL",
] as const;

// Growth levels by lifetime points (Solid Xpress reward spec §5).
export const GROWTH_LEVELS: { level: number; name: string }[] = [
  { level: 1, name: "New Learner" },
  { level: 2, name: "Reliable Executor" },
  { level: 3, name: "Problem Solver" },
  { level: 4, name: "Department Champion" },
  { level: 5, name: "Team Leader Potential" },
  { level: 6, name: "Business Builder" },
  { level: 7, name: "Solid Xpress Elite" },
];

export function growthLevelName(level: number): string {
  return GROWTH_LEVELS.find((g) => g.level === level)?.name ?? "New Learner";
}

// Lifetime points thresholds that unlock each growth level (spec §5):
// L1 0–999, L2 1k–3k, L3 3k–6k, L4 6k–10k, L5 10k–15k, L6 15k–25k, L7 25k+.
export const LEVEL_THRESHOLDS = [0, 1000, 3000, 6000, 10000, 15000, 25000];

export function levelForLifetime(points: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

/** Current YYYY-MM period string (used for monthly leaderboard & reviews). */
export function currentPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ===========================================================================
// Task points: difficulty × timeliness multipliers (spec formula)
// ===========================================================================

export const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  SIMPLE: 1.0,
  NORMAL: 1.2,
  IMPORTANT: 1.5,
  URGENT: 2.0,
  HIGH_RISK: 2.5,
};

export const TIMELINESS_MULTIPLIER: Record<string, number> = {
  EARLY: 1.2,
  ON_TIME: 1.0,
  LATE_EXPLAINED: 0.6,
  LATE_UNEXPLAINED: 0,
  REJECTED: 0,
};

export const DIFFICULTY_OPTIONS = ["SIMPLE", "NORMAL", "IMPORTANT", "URGENT", "HIGH_RISK"] as const;
export const TIMELINESS_OPTIONS = ["EARLY", "ON_TIME", "LATE_EXPLAINED", "LATE_UNEXPLAINED"] as const;

/** Task Points = base × difficulty × timeliness. */
export function taskPoints(base: number, difficulty: string, timeliness: string): number {
  const d = DIFFICULTY_MULTIPLIER[difficulty] ?? 1;
  const t = TIMELINESS_MULTIPLIER[timeliness] ?? 1;
  return Math.round(base * d * t);
}

// ===========================================================================
// Monthly score weights + grade bands (spec formula)
// ===========================================================================

export const SCORE_WEIGHTS = {
  kpi: 0.5,
  task: 0.2,
  accuracy: 0.15,
  teamwork: 0.1,
  discipline: 0.05,
} as const;

export function weightedScore(parts: {
  kpi: number;
  task: number;
  accuracy: number;
  teamwork: number;
  discipline: number;
}): number {
  return Math.round(
    parts.kpi * SCORE_WEIGHTS.kpi +
      parts.task * SCORE_WEIGHTS.task +
      parts.accuracy * SCORE_WEIGHTS.accuracy +
      parts.teamwork * SCORE_WEIGHTS.teamwork +
      parts.discipline * SCORE_WEIGHTS.discipline,
  );
}

/** Grade bands: A+ ≥95, A 90-94, B 80-89, C 70-79, D 60-69, E <60. */
export function gradeFor(score: number): string {
  if (score >= 95) return "A_PLUS";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
}

export const GRADE_LABEL: Record<string, string> = {
  A_PLUS: "A+", A: "A", B: "B", C: "C", D: "D", E: "E",
};

// ===========================================================================
// Universal penalty rules (seeded into PenaltyRule). Positive = points removed.
// External problems (vessel delay, customs inspection, port congestion, etc.)
// must NOT be in this list — only internal-cause issues.
// ===========================================================================

export const UNIVERSAL_PENALTIES: {
  name: string; deduction: number; severity: string; coaching?: boolean; redLine?: boolean;
}[] = [
  { name: "Task overdue (with explanation)", deduction: 5, severity: "LOW" },
  { name: "Daily report not submitted", deduction: 5, severity: "LOW" },
  { name: "No proof uploaded", deduction: 10, severity: "MEDIUM" },
  { name: "Customer update missed", deduction: 10, severity: "MEDIUM" },
  { name: "Internal handover unclear", deduction: 10, severity: "MEDIUM" },
  { name: "Task overdue (no explanation)", deduction: 15, severity: "MEDIUM" },
  { name: "Same mistake repeated", deduction: 20, severity: "HIGH", coaching: true },
  { name: "Wrong data entry", deduction: 20, severity: "HIGH" },
  { name: "Customer complaint (negligence)", deduction: 30, severity: "HIGH", coaching: true },
  { name: "Additional cost from staff mistake", deduction: 50, severity: "HIGH", coaching: true },
  { name: "Customs/port/permit penalty (negligence)", deduction: 120, severity: "CRITICAL", coaching: true },
  { name: "Hidden issue not reported", deduction: 100, severity: "CRITICAL", coaching: true },
  { name: "Integrity issue (RED LINE)", deduction: 0, severity: "CRITICAL", coaching: true, redLine: true },
];

/** Problems caused by external parties — shown as a reminder, never auto-deducted. */
export const EXTERNAL_NON_FAULT = [
  "Vessel delay", "Customs inspection", "Port congestion", "Liner system issue",
  "Customer late document submission", "Government authority delay", "Weather delay",
  "Supplier delay outside staff control",
];

// ===========================================================================
// Special contribution points (manager-awarded recognition)
// ===========================================================================

export const SPECIAL_CONTRIBUTIONS: { name: string; points: number }[] = [
  { name: "Detect major risk early", points: 100 },
  { name: "Prevent customer penalty", points: 200 },
  { name: "Save company cost", points: 200 },
  { name: "Customer compliment", points: 100 },
  { name: "Recover lost customer", points: 200 },
  { name: "Help another department", points: 50 },
  { name: "Create new SOP", points: 150 },
  { name: "Train junior staff", points: 100 },
  { name: "Suggest useful improvement", points: 80 },
  { name: "Solve urgent case successfully", points: 100 },
  { name: "Recover overdue payment", points: 150 },
  { name: "Close high-value customer", points: 200 },
];

export const SEVERITY_RAG: Record<string, "ok" | "warn" | "danger"> = {
  LOW: "warn", MEDIUM: "warn", HIGH: "danger", CRITICAL: "danger",
};

export const LUCKY_DRAW_SOURCES: Record<string, string> = {
  GRADE: "Monthly performance grade",
  KPI_SCORE: "Monthly KPI score above 85",
  COMPLIMENT: "Customer compliment",
  ZERO_OVERDUE: "Zero overdue tasks",
  BADGE: "Earned a badge",
  TICKET: "Redeemed lucky draw ticket",
  TEAMWORK: "Helped another department",
  ZERO_MISTAKE: "Zero mistake this month",
  CHAMPION: "Department / company champion",
  MANUAL: "Awarded by admin",
};

// Lucky-draw entries earned from the monthly grade (spec §6A).
export const GRADE_LUCKY_ENTRIES: Record<string, number> = {
  A_PLUS: 5, A: 3, B: 1, C: 0, D: 0, E: 0,
};

// Lucky-draw campaign templates (spec §6B–§6E). Picking a template pre-fills
// the campaign and seeds its prize line-up.
export interface CampaignTemplate {
  type: string;
  title: string;
  description: string;
  entryRule: string;
  pointsPerEntry: number;
  prizes: { prizeName: string; prizeValue: number; quantity: number }[];
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    type: "MONTHLY_MINI", title: "Monthly Mini Lucky Draw",
    description: "Small vouchers and mystery gifts to keep daily motivation high.",
    entryRule: "Grade A+=5 · A=3 · B=1 · Zero mistake=3 · Compliment=3 · All daily reports=2",
    pointsPerEntry: 300,
    prizes: [
      { prizeName: "RM100 Voucher", prizeValue: 100, quantity: 1 },
      { prizeName: "RM50 Voucher", prizeValue: 50, quantity: 2 },
      { prizeName: "Mystery Gift", prizeValue: 50, quantity: 3 },
      { prizeName: "Free Lunch", prizeValue: 30, quantity: 5 },
    ],
  },
  {
    type: "QUARTERLY_CHAMPION", title: "Quarterly Champion Draw",
    description: "Bigger rewards for a quarter of strong performance.",
    entryRule: "Department champion=5 · Company champion=10 · Grade A+ across the quarter",
    pointsPerEntry: 0,
    prizes: [
      { prizeName: "RM300 Voucher", prizeValue: 300, quantity: 1 },
      { prizeName: "Family Dinner Voucher", prizeValue: 200, quantity: 1 },
      { prizeName: "Training Sponsorship", prizeValue: 300, quantity: 1 },
      { prizeName: "Premium Solid Xpress Gift Box", prizeValue: 150, quantity: 2 },
    ],
  },
  {
    type: "ANNUAL_MEGA", title: "Annual Dinner Mega Draw",
    description: "The big one — linked to attendance, KPI grade, badge count and contribution.",
    entryRule: "Earned across the year: grade, badges, zero-mistake months, no major discipline issue",
    pointsPerEntry: 0,
    prizes: [
      { prizeName: "RM1,000 Grand Prize", prizeValue: 1000, quantity: 1 },
      { prizeName: "Travel Subsidy", prizeValue: 800, quantity: 1 },
      { prizeName: "Hotel Stay Voucher", prizeValue: 500, quantity: 1 },
      { prizeName: "Premium Electronic Gift", prizeValue: 600, quantity: 1 },
      { prizeName: "Family Meal Voucher", prizeValue: 150, quantity: 3 },
      { prizeName: "Mystery Box", prizeValue: 80, quantity: 5 },
    ],
  },
  {
    type: "ZERO_MISTAKE", title: "Zero Mistake Draw",
    description: "A special draw rewarding accuracy — only zero-mistake staff are entered.",
    entryRule: "1 entry per zero-mistake month",
    pointsPerEntry: 0,
    prizes: [{ prizeName: "Accuracy Champion Prize", prizeValue: 150, quantity: 1 }, { prizeName: "Mystery Gift", prizeValue: 50, quantity: 2 }],
  },
  {
    type: "TEAMWORK", title: "Teamwork Draw",
    description: "For staff who help other departments.",
    entryRule: "1 entry per cross-department help",
    pointsPerEntry: 0,
    prizes: [{ prizeName: "Team Player Voucher", prizeValue: 100, quantity: 2 }],
  },
  {
    type: "CUSTOMER_HERO", title: "Customer Hero Draw",
    description: "For staff who earn customer compliments.",
    entryRule: "3 entries per customer compliment",
    pointsPerEntry: 0,
    prizes: [{ prizeName: "Customer Hero Reward", prizeValue: 150, quantity: 1 }],
  },
];

// Company-level toggles that block leave-reward redemption (spec §C).
export const LEAVE_BLOCK_SETTINGS: { key: string; label: string }[] = [
  { key: "MONTH_END_CLOSING", label: "Month-end closing in progress" },
  { key: "PEAK_PERIOD", label: "Peak operation period" },
  { key: "SHORT_HANDED", label: "Departments short-handed" },
];
