/**
 * User-management permission matrix (spec: Access Control Rules).
 * Note: the app's "Boss" is the SUPER_ADMIN role; MANAGEMENT is separate.
 *
 * This module is intentionally free of server-only imports so it can be used
 * from both server components/actions and client components (badge maps etc.).
 */

export function isSuperAdmin(role: string) {
  return role === "SUPER_ADMIN";
}

/** Boss-tier (Super Admin or Management). Mirrors rbac.isBoss without the
 *  server-only dependency chain. */
export function isBoss(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGEMENT";
}

/** Who can open the User Management area at all. */
export function canAccessUserAdmin(role: string) {
  return isBoss(role) || role === "HR_ADMIN" || role === "DEPARTMENT_HEAD";
}

/** Who can create new users (Boss + HR). */
export function canCreateUsers(role: string) {
  return isSuperAdmin(role) || role === "HR_ADMIN";
}

/** Who can deactivate / reactivate users (Boss + HR). */
export function canDeactivateUsers(role: string) {
  return isSuperAdmin(role) || role === "HR_ADMIN";
}

/** Can `actor` reset the password of a user with `targetRole`? */
export function canResetPassword(actorRole: string, targetRole: string) {
  if (isSuperAdmin(actorRole)) return true;
  if (actorRole === "HR_ADMIN") return !isSuperAdmin(targetRole); // HR can't touch Boss
  return false;
}

/** Can `actor` assign `newRole` to someone? Only Boss can grant SUPER_ADMIN. */
export function canAssignRole(actorRole: string, newRole: string) {
  if (isSuperAdmin(newRole)) return isSuperAdmin(actorRole);
  return isSuperAdmin(actorRole) || actorRole === "HR_ADMIN";
}

type Actor = { id: string; role: string; departmentId: string | null };
type Target = { id: string; role: string; departmentId: string | null };

/**
 * Edit scope of `actor` over `target`:
 *  - "full"    : can change role, department, manager, status, type, etc.
 *  - "limited" : can change job title, phone, avatar only
 *  - "none"    : cannot edit
 */
export function editScope(actor: Actor, target: Target): "full" | "limited" | "none" {
  if (isSuperAdmin(actor.role)) return "full";
  if (actor.role === "HR_ADMIN") return isSuperAdmin(target.role) ? "none" : "full";
  if (actor.role === "MANAGEMENT") return isSuperAdmin(target.role) ? "none" : "limited";
  if (actor.role === "DEPARTMENT_HEAD") {
    return target.departmentId && target.departmentId === actor.departmentId && target.role === "STAFF"
      ? "limited"
      : "none";
  }
  return "none";
}

/** Can `actor` view the profile of `target`? */
export function canViewUser(actor: Actor, target: Target): boolean {
  if (actor.id === target.id) return true;
  if (isBoss(actor.role) || actor.role === "HR_ADMIN") return true;
  if (actor.role === "DEPARTMENT_HEAD") return target.departmentId === actor.departmentId;
  return false;
}

/** Prisma `where` scope for the user list, per actor. */
export function userListScope(actor: Actor): { departmentId?: string } {
  if (isBoss(actor.role) || actor.role === "HR_ADMIN") return {};
  if (actor.role === "DEPARTMENT_HEAD") return { departmentId: actor.departmentId ?? "__none__" };
  return { departmentId: "__none__" };
}

/** Validate a password against the policy (min 8, one uppercase, one number). */
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  return null;
}

// ---- Display maps (badge colours per spec) --------------------------------

export const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700",
  MANAGEMENT: "bg-blue-100 text-blue-700",
  DEPARTMENT_HEAD: "bg-indigo-100 text-indigo-700",
  HR_ADMIN: "bg-pink-100 text-pink-700",
  FINANCE_ADMIN: "bg-emerald-100 text-emerald-700",
  STAFF: "bg-slate-100 text-slate-600",
};

export const ROLE_SHORT: Record<string, string> = {
  SUPER_ADMIN: "Boss",
  MANAGEMENT: "Management",
  DEPARTMENT_HEAD: "Dept Head",
  HR_ADMIN: "HR Admin",
  FINANCE_ADMIN: "Finance",
  STAFF: "Staff",
};

export const EMPLOYMENT_STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  CONFIRMED: "bg-green-100 text-green-700",
  PROBATION: "bg-amber-100 text-amber-700",
  ON_LEAVE: "bg-amber-100 text-amber-700",
  RESIGNED: "bg-slate-100 text-slate-500",
  TERMINATED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-red-100 text-red-700",
};

export const ACCESS_STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-slate-200 text-slate-500",
  LOCKED: "bg-red-100 text-red-700",
};

export const EMPLOYMENT_STATUSES = ["ACTIVE", "PROBATION", "CONFIRMED", "RESIGNED", "TERMINATED", "SUSPENDED"];
export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "PROBATION"];
export const ACCESS_STATUSES = ["ACTIVE", "INACTIVE", "LOCKED"];
export const MANAGEABLE_ROLES = ["STAFF", "DEPARTMENT_HEAD", "HR_ADMIN", "FINANCE_ADMIN", "MANAGEMENT", "SUPER_ADMIN"];
