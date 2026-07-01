import { redirect } from "next/navigation";
import { getCurrentUser, getSession, type SessionUser } from "./auth";

/**
 * Role-based access control helpers (section A / Q).
 *
 * Capability matrix:
 *  - SUPER_ADMIN / MANAGEMENT : everything, all departments.
 *  - DEPARTMENT_HEAD          : own department + staff under them.
 *  - HR_ADMIN                 : staff profiles, onboarding, training, reviews, rewards.
 *  - FINANCE_ADMIN            : finance module + finance KPI.
 *  - STAFF                    : own data only.
 */

export const ALL_ROLES = [
  "SUPER_ADMIN",
  "MANAGEMENT",
  "DEPARTMENT_HEAD",
  "STAFF",
  "HR_ADMIN",
  "FINANCE_ADMIN",
];

export function isBoss(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGEMENT";
}

export function canViewAllDepartments(role: string) {
  return isBoss(role);
}

export function canManageUsers(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

export function canViewFinance(role: string) {
  return isBoss(role) || role === "FINANCE_ADMIN";
}

/** Can the given role approve tasks (department head or boss)? Staff cannot. */
export function canApproveTasks(role: string) {
  return isBoss(role) || role === "DEPARTMENT_HEAD";
}

export function canManageRewards(role: string) {
  return isBoss(role) || role === "HR_ADMIN";
}

/** Require an authenticated session in a server component; redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Require a full DB user (with department/profile). Redirects if not logged in. */
export async function requireFullUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require one of the allowed roles, else redirect to dashboard. */
export async function requireRole(allowed: string[]) {
  const session = await requireUser();
  if (!allowed.includes(session.role)) redirect("/dashboard");
  return session;
}
