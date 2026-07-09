import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSession } from "./auth";
import { NAV, type NavGroup } from "@/components/nav";

/**
 * Per-user feature rights/restrictions (User Management module).
 *
 * Resolution order for a feature:
 *   1. SUPER_ADMIN / MANAGEMENT → always allowed (bosses can't be locked out).
 *   2. Per-user override row      → ALLOW grants, DENY blocks.
 *   3. Role default               → FEATURES[key].roles (undefined = everyone).
 *
 * Enforced in BOTH the sidebar (items hidden/shown) and the pages themselves
 * (requireFeature redirects on deny).
 */

export interface FeatureDef {
  label: string;
  icon: string;
  /** Route prefixes this feature covers (first one used for nav matching). */
  hrefs: string[];
  /** Roles allowed by default. undefined = every signed-in user. */
  roles?: string[];
  /** true → ALLOW override cannot open it beyond roles (page logic is role-bound). */
  denyOnly?: boolean;
  /** Supports PARTIAL access scoped to specific items (e.g. training topic folders). */
  scopable?: "training-topics";
}

const MGRS = ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "HR_ADMIN"];
const ADMINS = ["SUPER_ADMIN", "MANAGEMENT", "HR_ADMIN"];

export const FEATURES: Record<string, FeatureDef> = {
  // Everyone-by-default features (restrictable per user)
  "attendance":        { label: "Attendance Centre", icon: "⏰", hrefs: ["/attendance"] },
  "task-board":        { label: "Mission Board (tasks)", icon: "🎯", hrefs: ["/missions"] },
  "job-board":         { label: "Job Board", icon: "📦", hrefs: ["/jobs"] },
  "kpi":               { label: "KPI Dashboard", icon: "📈", hrefs: ["/kpi"] },
  "daily-report":      { label: "Daily Report", icon: "📝", hrefs: ["/daily-report"] },
  "work-reports":      { label: "Work Reports", icon: "📄", hrefs: ["/work-reports"] },
  "wallet":            { label: "Diamond Wallet", icon: "💎", hrefs: ["/wallet"] },
  "diamond-guide":     { label: "How Diamonds Work", icon: "📖", hrefs: ["/diamonds-guide"] },
  "rewards":           { label: "Reward Store", icon: "🎁", hrefs: ["/rewards"] },
  "badges":            { label: "Badge Centre", icon: "🏅", hrefs: ["/badges"] },
  "lucky-draw":        { label: "Lucky Draw", icon: "🎰", hrefs: ["/lucky-draw"] },
  "wishing-tree":      { label: "Wishing Tree", icon: "🌳", hrefs: ["/wishing-tree"] },
  "training":          { label: "Training Centre", icon: "📚", hrefs: ["/training"], scopable: "training-topics" },
  "game-centre":       { label: "Game Centre", icon: "🎮", hrefs: ["/missions-hub"] },
  "pk-arena":          { label: "PK Arena", icon: "⚔️", hrefs: ["/pk-arena"] },
  "proposals":         { label: "Idea Bank", icon: "💡", hrefs: ["/proposals"] },
  "announcements":     { label: "Announcements", icon: "📢", hrefs: ["/announcements"] },
  "forum":             { label: "Staff Forum", icon: "💬", hrefs: ["/forum"] },
  "achievement-wall":  { label: "Achievement Wall", icon: "🏛️", hrefs: ["/achievement-wall"] },
  "leaderboard":       { label: "Leaderboard", icon: "🏆", hrefs: ["/leaderboard"] },
  "ceremony":          { label: "Recognition", icon: "🎤", hrefs: ["/ceremony"] },
  "onboarding":        { label: "Onboarding", icon: "📋", hrefs: ["/onboarding"] },
  "diamond-transactions": { label: "Diamond Transactions", icon: "🧾", hrefs: ["/diamonds/transactions"] },
  // Role-gated features (grantable via ALLOW, restrictable via DENY)
  "kpi-setup":         { label: "KPI Setup", icon: "⚙️", hrefs: ["/kpi-setup"], roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD"], denyOnly: true },
  "reports":           { label: "Monthly Report", icon: "📑", hrefs: ["/reports"], roles: ADMINS },
  "diamond-admin":     { label: "Diamond Admin", icon: "⚖️", hrefs: ["/points-admin"], roles: MGRS },
  "coaching":          { label: "Coaching Centre", icon: "🎓", hrefs: ["/coaching"], roles: MGRS, denyOnly: true },
  "reviews":           { label: "Performance Review", icon: "🗂️", hrefs: ["/reviews"], roles: MGRS, denyOnly: true },
  "finance":           { label: "Finance Control", icon: "💰", hrefs: ["/finance"], roles: ["SUPER_ADMIN", "MANAGEMENT", "FINANCE_ADMIN"], denyOnly: true },
  "user-management":   { label: "User Management", icon: "👥", hrefs: ["/users"], roles: [...MGRS], denyOnly: true },
  "departments":       { label: "Departments", icon: "🏢", hrefs: ["/departments"], roles: ADMINS, denyOnly: true },
  "attendance-team":   { label: "Team Attendance", icon: "👥", hrefs: ["/attendance/team"], roles: MGRS },
  "attendance-settings": { label: "Attendance Settings", icon: "⚙️", hrefs: ["/attendance/settings"], roles: ADMINS },
  "pk-campaigns":      { label: "PK Campaign Admin", icon: "⚔️", hrefs: ["/pk-arena/campaigns"], roles: ADMINS },
  "diamond-requests":  { label: "Diamond Requests", icon: "📥", hrefs: ["/diamonds/requests"], roles: [...MGRS] },
  "reward-rules":      { label: "Reward Rules", icon: "🎯", hrefs: ["/settings/reward-rules"], roles: ["SUPER_ADMIN", "MANAGEMENT"] },
  // Company-performance system
  "job-handling":      { label: "Job Handling Records", icon: "🗂️", hrefs: ["/jobs/handling-records"] },
  "monthly-review":    { label: "Monthly Performance Card", icon: "🗂️", hrefs: ["/performance/monthly-review"] },
  "deduction-cases":   { label: "Deduction Cases", icon: "⚠️", hrefs: ["/performance/deductions"] },
  "deduction-rules":   { label: "Deduction Rule Centre", icon: "⚖️", hrefs: ["/performance/deduction-rules"], roles: ["SUPER_ADMIN", "MANAGEMENT", "HR_ADMIN"] },
  "commission":        { label: "Sales Commission", icon: "💰", hrefs: ["/commission"] },
  "bonus-pool":        { label: "Team Bonus Pool", icon: "🎁", hrefs: ["/bonus-pool"] },
  "ai-coach":          { label: "AI Performance Coach", icon: "🤖", hrefs: ["/ai-performance-coach"] },
  "ai-response":       { label: "AI Response Centre", icon: "✉️", hrefs: ["/ai-response-centre"] },
  "results":           { label: "Result Centre", icon: "🏁", hrefs: ["/results"] },
  "inquiries":         { label: "Assigned Inquiries", icon: "📨", hrefs: ["/inquiries"] },
  "cs-profiles":       { label: "CS Role Profiles", icon: "👥", hrefs: ["/goals/cs-profiles"], roles: ["SUPER_ADMIN", "MANAGEMENT", "HR_ADMIN", "DEPARTMENT_HEAD"] },
  "staff-classes":     { label: "Staff Classes (A/B/C)", icon: "🏷️", hrefs: ["/performance/staff-classes"], roles: ["SUPER_ADMIN", "MANAGEMENT", "HR_ADMIN", "DEPARTMENT_HEAD"] },
  "company-goals":     { label: "Company Goal Centre", icon: "🏢", hrefs: ["/goals/company"], roles: ["SUPER_ADMIN", "MANAGEMENT"], denyOnly: true },
  "department-goals":  { label: "Department KPI Centre", icon: "🏬", hrefs: ["/goals/departments"], roles: ["SUPER_ADMIN", "MANAGEMENT", "DEPARTMENT_HEAD", "HR_ADMIN"] },
  "position-kpi":      { label: "Position KPI Setup", icon: "🎯", hrefs: ["/goals/position-kpi"], roles: ["SUPER_ADMIN", "MANAGEMENT", "HR_ADMIN"] },
};

export function isBossRole(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGEMENT";
}

export type AccessLevel = "ALLOW" | "DENY" | "PARTIAL";
export type Overrides = Map<string, AccessLevel>;

export async function getFeatureOverrides(userId: string): Promise<Overrides> {
  const rows = await prisma.userFeatureAccess.findMany({ where: { userId } });
  return new Map(rows.map((r) => [r.featureKey, r.access as AccessLevel]));
}

/** Resolve access for one feature given role + per-user overrides.
 *  PARTIAL counts as "can enter" — the page itself narrows what's visible. */
export function hasFeatureAccess(role: string, overrides: Overrides, key: string): boolean {
  if (isBossRole(role)) return true;
  const def = FEATURES[key];
  if (!def) return true; // unregistered = ungoverned
  const ov = overrides.get(key);
  if (ov === "DENY") return false;
  const roleAllowed = !def.roles || def.roles.includes(role);
  if (ov === "ALLOW" || ov === "PARTIAL") return def.denyOnly ? roleAllowed : true;
  return roleAllowed;
}

/**
 * Training topic scope for a user: null = full access (no PARTIAL override),
 * otherwise the Set of TrainingTopic ids they may see. Bosses are never scoped.
 */
export async function getTrainingTopicScope(userId: string, role: string): Promise<Set<string> | null> {
  if (isBossRole(role)) return null;
  const row = await prisma.userFeatureAccess.findUnique({
    where: { userId_featureKey: { userId, featureKey: "training" } },
  });
  if (!row || row.access !== "PARTIAL" || !row.scopeJson) return null;
  try {
    const parsed = JSON.parse(row.scopeJson) as { topicIds?: unknown };
    if (Array.isArray(parsed.topicIds)) return new Set(parsed.topicIds.filter((t): t is string => typeof t === "string"));
  } catch { /* malformed scope = no restriction rather than lockout */ }
  return null;
}

/** Href-prefix → feature key (longest prefix wins, so /attendance/team ≠ /attendance). */
const HREF_TO_KEY: [string, string][] = Object.entries(FEATURES)
  .flatMap(([key, def]) => def.hrefs.map((h): [string, string] => [h, key]))
  .sort((a, b) => b[0].length - a[0].length);

export function featureKeyForHref(href: string): string | null {
  for (const [prefix, key] of HREF_TO_KEY) if (href === prefix) return key;
  return null;
}

/** Sidebar nav filtered by role defaults + per-user overrides. */
export function navForUser(role: string, overrides: Overrides): NavGroup[] {
  return NAV.map((g) => ({
    group: g.group,
    items: g.items.filter((i) => {
      const key = featureKeyForHref(i.href);
      if (key) return hasFeatureAccess(role, overrides, key);
      return !i.roles || i.roles.includes(role); // unmapped items stay role-based
    }),
  })).filter((g) => g.items.length > 0);
}

/**
 * Server-side page guard: redirects to /dashboard when the signed-in user may
 * not use the feature. Returns the session for convenience.
 */
export async function requireFeature(key: string) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (isBossRole(s.role)) return s;
  const overrides = await getFeatureOverrides(s.id);
  if (!hasFeatureAccess(s.role, overrides, key)) redirect("/dashboard");
  return s;
}
