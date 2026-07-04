"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";
import {
  canCreateUsers,
  canDeactivateUsers,
  canResetPassword,
  canAssignRole,
  editScope,
  validatePassword,
} from "@/lib/user-permissions";
import { logAudit } from "@/lib/audit";
import { isBoss } from "@/lib/rbac";
import { awardOnboardingDiamonds, reverseOnboardingDiamonds, getOnboardingSetting } from "@/lib/onboarding-bonus";

async function actor() {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  return s;
}

export interface CreateUserResult {
  userId: string;
  bonusAwarded: boolean;
  bonusAmount: number;
}

/** Create a new staff user (Boss / HR). Auto-creates the points wallet + profile. */
export async function createUser(formData: FormData): Promise<CreateUserResult> {
  const me = await actor();
  if (!canCreateUsers(me.role)) throw new Error("Forbidden");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "STAFF");
  const departmentId = String(formData.get("departmentId") ?? "") || null;
  const password = String(formData.get("password") ?? "");

  if (!name) throw new Error("Full name is required.");
  if (!email) throw new Error("Email is required.");
  if (!departmentId) throw new Error("Department is required.");
  if (!password) throw new Error("Temporary password is required.");
  const pwErr = validatePassword(password);
  if (pwErr) throw new Error(pwErr);
  if (!canAssignRole(me.role, role)) throw new Error("You are not allowed to assign that role.");

  if (await prisma.user.findUnique({ where: { email } })) throw new Error("A user with this email already exists.");
  const employeeCode = String(formData.get("employeeCode") ?? "").trim() || null;
  if (employeeCode && (await prisma.user.findUnique({ where: { employeeCode } }))) {
    throw new Error("Employee code already in use.");
  }

  const managerId = String(formData.get("managerId") ?? "") || null;
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      employeeCode,
      passwordHash,
      role,
      departmentId,
      managerId,
      jobTitle: String(formData.get("jobTitle") ?? "") || null,
      phoneNumber: String(formData.get("phoneNumber") ?? "") || null,
      avatarUrl: String(formData.get("avatarUrl") ?? "") || null,
      dateOfBirth: formData.get("dateOfBirth") ? new Date(String(formData.get("dateOfBirth"))) : null,
      employmentType: String(formData.get("employmentType") ?? "FULL_TIME"),
      employmentStatus: String(formData.get("employmentStatus") ?? "PROBATION"),
      accessStatus: "ACTIVE",
      // Staff must replace the admin-set temporary password on first login.
      mustChangePassword: true,
      isActive: true,
      joinDate: formData.get("joinDate") ? new Date(String(formData.get("joinDate"))) : new Date(),
      createdBy: me.id,
      updatedBy: me.id,
      // Points wallet is denormalised on the user (defaults to 0) — created here.
      profile: { create: { onboardingProgress: 0 } },
    },
  });

  await logAudit(prisma, { action: "USER_CREATED", entityId: user.id, performedBy: me.id, actorName: me.name, newValue: { email, name, role, departmentId } });

  // New Staff Onboarding Bonus — auto-award welcome diamonds on account
  // creation when the setting is enabled and configured for that timing. Other
  // timings (manual approval / checklist completion) are triggered elsewhere.
  let bonusAwarded = false;
  let bonusAmount = 0;
  const setting = await getOnboardingSetting();
  if (setting.enabled && setting.timing === "ON_USER_CREATION") {
    const res = await awardOnboardingDiamonds(user.id, me.id);
    if (res.ok && res.awarded) { bonusAwarded = true; bonusAmount = res.amount; }
  }

  revalidatePath("/users");
  return { userId: user.id, bonusAwarded, bonusAmount };
}

/**
 * Manually award the onboarding bonus (Boss always; HR Admin when the setting
 * allows). Used for the "manual approval" timing, or to grant it to a staff who
 * was created while the bonus was disabled. Dedupe-guarded.
 */
export async function awardOnboardingBonusManual(userId: string) {
  const me = await actor();
  const isHr = me.role === "HR_ADMIN";
  if (!isBoss(me.role) && !isHr) throw new Error("Forbidden");

  const setting = await getOnboardingSetting();
  if (!setting.enabled) throw new Error("Onboarding diamond bonus is currently disabled.");
  // HR may only trigger manually when the timing setting permits a manual grant.
  if (isHr && !isBoss(me.role) && setting.timing === "ON_ONBOARDING_COMPLETION") {
    throw new Error("This bonus is set to award on onboarding completion, not manual grant.");
  }

  const res = await awardOnboardingDiamonds(userId, me.id);
  if (!res.ok && res.reason === "duplicate") throw new Error("Onboarding diamond bonus has already been issued to this staff.");
  if (!res.ok) throw new Error("Could not award the onboarding bonus.");
  if (res.ok && !res.awarded) throw new Error("Onboarding diamond bonus is currently disabled.");

  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
}

/** Reverse a wrongly-issued onboarding bonus (Owner / Boss only). */
export async function reverseOnboardingBonus(userId: string) {
  const me = await actor();
  if (!isBoss(me.role)) throw new Error("Only the Owner can reverse an onboarding bonus.");
  const res = await reverseOnboardingDiamonds(userId, me.id);
  if (!res.ok && res.reason === "no_bonus") throw new Error("This staff has no onboarding bonus to reverse.");
  if (!res.ok && res.reason === "already_reversed") throw new Error("This onboarding bonus has already been reversed.");
  if (!res.ok) throw new Error("Could not reverse the onboarding bonus.");
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
}

/** Update a user, respecting the editing role's field scope. */
export async function updateUser(formData: FormData) {
  const me = await actor();
  const id = String(formData.get("id") ?? "");
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new Error("User not found");

  const scope = editScope({ id: me.id, role: me.role, departmentId: me.departmentId }, { id: target.id, role: target.role, departmentId: target.departmentId });
  if (scope === "none") throw new Error("You are not allowed to edit this user.");

  const data: Record<string, unknown> = { updatedBy: me.id };
  const changes: Record<string, [unknown, unknown]> = {};

  // Limited fields — allowed for both "limited" and "full".
  const jobTitle = String(formData.get("jobTitle") ?? "") || null;
  if (jobTitle !== target.jobTitle) { data.jobTitle = jobTitle; changes.jobTitle = [target.jobTitle, jobTitle]; }
  const phoneNumber = String(formData.get("phoneNumber") ?? "") || null;
  if (phoneNumber !== target.phoneNumber) { data.phoneNumber = phoneNumber; changes.phoneNumber = [target.phoneNumber, phoneNumber]; }
  const avatarUrl = String(formData.get("avatarUrl") ?? "") || null;
  if (avatarUrl !== target.avatarUrl) data.avatarUrl = avatarUrl;
  // Date of birth — powers the birthday celebration. Empty clears it.
  if (formData.has("dateOfBirth")) {
    const dobRaw = String(formData.get("dateOfBirth") ?? "");
    data.dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? new Date(`${dobRaw}T00:00:00Z`) : null;
  }

  if (scope === "full") {
    const name = String(formData.get("name") ?? "").trim();
    if (name && name !== target.name) { data.name = name; changes.name = [target.name, name]; }

    const employeeCode = String(formData.get("employeeCode") ?? "").trim() || null;
    if (employeeCode !== target.employeeCode) {
      if (employeeCode) {
        const clash = await prisma.user.findUnique({ where: { employeeCode } });
        if (clash && clash.id !== id) throw new Error("Employee code already in use.");
      }
      data.employeeCode = employeeCode;
    }

    const departmentId = String(formData.get("departmentId") ?? "") || null;
    if (departmentId !== target.departmentId) { data.departmentId = departmentId; changes.department = [target.departmentId, departmentId]; }

    let managerId = String(formData.get("managerId") ?? "") || null;
    if (managerId === id) managerId = null; // cannot be own manager
    if (managerId !== target.managerId) data.managerId = managerId;

    const role = String(formData.get("role") ?? target.role);
    if (role !== target.role) {
      if (!canAssignRole(me.role, role)) throw new Error("You are not allowed to assign that role.");
      data.role = role; changes.role = [target.role, role];
    }

    const employmentType = String(formData.get("employmentType") ?? target.employmentType);
    if (employmentType !== target.employmentType) data.employmentType = employmentType;

    const employmentStatus = String(formData.get("employmentStatus") ?? target.employmentStatus);
    if (employmentStatus !== target.employmentStatus) { data.employmentStatus = employmentStatus; changes.employmentStatus = [target.employmentStatus, employmentStatus]; }
  }

  await prisma.user.update({ where: { id }, data });
  await logAudit(prisma, { action: "USER_UPDATED", entityId: id, performedBy: me.id, actorName: me.name, oldValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v[0]])), newValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v[1]])) });
  if (changes.role) await logAudit(prisma, { action: "ROLE_CHANGED", entityId: id, performedBy: me.id, actorName: me.name, oldValue: changes.role[0], newValue: changes.role[1] });
  if (changes.department) await logAudit(prisma, { action: "DEPARTMENT_CHANGED", entityId: id, performedBy: me.id, actorName: me.name, oldValue: changes.department[0], newValue: changes.department[1] });
  if (changes.employmentStatus) await logAudit(prisma, { action: "STATUS_CHANGED", entityId: id, performedBy: me.id, actorName: me.name, oldValue: changes.employmentStatus[0], newValue: changes.employmentStatus[1] });

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
}

/** Reset a user's password (Boss / HR). Enforces the password policy + audit. */
export async function resetUserPassword(formData: FormData) {
  const me = await actor();
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new Error("User not found");
  if (!canResetPassword(me.role, target.role)) throw new Error("You are not allowed to reset this user's password.");
  const pwErr = validatePassword(password);
  if (pwErr) throw new Error(pwErr);
  if (password !== confirm) throw new Error("Passwords do not match.");

  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true, updatedBy: me.id } });
  await logAudit(prisma, { action: "PASSWORD_RESET", entityId: id, performedBy: me.id, actorName: me.name });
  revalidatePath(`/users/${id}`);
}

async function setAccess(id: string, active: boolean) {
  const me = await actor();
  if (!canDeactivateUsers(me.role)) throw new Error("Forbidden");
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new Error("User not found");

  await prisma.user.update({
    where: { id },
    data: { accessStatus: active ? "ACTIVE" : "INACTIVE", isActive: active, updatedBy: me.id },
  });
  await logAudit(prisma, { action: active ? "USER_REACTIVATED" : "USER_DEACTIVATED", entityId: id, performedBy: me.id, actorName: me.name });
  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
}

export async function deactivateUser(id: string) {
  await setAccess(id, false);
}
export async function reactivateUser(id: string) {
  await setAccess(id, true);
}

export type DeleteUserResult = { ok: true } | { ok: false; error: string };

/**
 * Permanently delete a DEACTIVATED staff account and all their personal
 * records (PDPA erasure). Boss/Management only; active accounts must be
 * deactivated first, so a working account can never be deleted by accident.
 * Where the person was merely an actor on someone else's record (reporting
 * manager, task creator, KPI owner, review manager...) the reference is
 * detached so the other staff's history is kept.
 */
export async function deleteUser(id: string): Promise<DeleteUserResult> {
  const fail = (error: string): DeleteUserResult => ({ ok: false, error });
  const me = await actor();
  if (!isBoss(me.role)) return fail("Only Boss / Management can delete staff records.");
  if (me.id === id) return fail("You cannot delete your own account.");

  const target = await prisma.user.findUnique({ where: { id }, select: { name: true, email: true, role: true, accessStatus: true, isActive: true } });
  if (!target) return fail("User not found.");
  if (isBoss(target.role)) return fail("Boss / Management accounts cannot be deleted here.");
  if (target.isActive || target.accessStatus === "ACTIVE") {
    return fail("This account is still active — deactivate it first, then delete.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Detach where they were only an actor on other people's records.
      await tx.user.updateMany({ where: { managerId: id }, data: { managerId: null } });
      await tx.kPI.updateMany({ where: { ownerId: id }, data: { ownerId: null } });
      await tx.kPI.updateMany({ where: { reviewerId: id }, data: { reviewerId: null } });
      await tx.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.task.updateMany({ where: { reviewerId: id }, data: { reviewerId: null } });
      await tx.task.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.training.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.attachment.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } });
      await tx.luckyDrawPrize.updateMany({ where: { winnerUserId: id }, data: { winnerUserId: null } });
      await tx.levelUpgradeRequest.updateMany({ where: { approvedById: id }, data: { approvedById: null } });
      await tx.performanceReview.updateMany({ where: { managerId: id }, data: { managerId: null } });

      // Their own records that don't cascade automatically.
      await tx.taskComment.deleteMany({ where: { authorId: id } });
      await tx.kPIResult.deleteMany({ where: { userId: id } });
      await tx.rewardRedemption.deleteMany({ where: { userId: id } });
      await tx.coachingRecord.deleteMany({ where: { OR: [{ staffId: id }, { coachId: id }] } });
      await tx.performanceReview.deleteMany({ where: { staffId: id } });
      await tx.trainingCompletion.deleteMany({ where: { userId: id } });
      await tx.quizAttempt.deleteMany({ where: { userId: id } }); // answers cascade from attempt
      await tx.luckyDrawEntry.deleteMany({ where: { userId: id } });

      // Everything else (wallet, attendance, badges, reports, forum, wishes,
      // notifications, feature access, profile...) cascades from the user row.
      await tx.user.delete({ where: { id } });
    });
  } catch (e) {
    console.error("deleteUser failed:", e);
    return fail("Delete failed — this account still has linked records. Contact support or keep it deactivated.");
  }

  await logAudit(prisma, {
    action: "USER_DELETED", entityId: id, entityType: "USER",
    performedBy: me.id, actorName: me.name,
    newValue: { name: target.name, email: target.email },
  });
  revalidatePath("/users");
  return { ok: true };
}

/** Self-service profile update (any user): phone, avatar, and optional password. */
export async function updateMyProfile(formData: FormData) {
  const me = await actor();
  const data: Record<string, unknown> = {
    phoneNumber: String(formData.get("phoneNumber") ?? "") || null,
    avatarUrl: String(formData.get("avatarUrl") ?? "") || null,
    updatedBy: me.id,
  };

  const password = String(formData.get("password") ?? "");
  if (password) {
    const pwErr = validatePassword(password);
    if (pwErr) throw new Error(pwErr);
    if (password !== String(formData.get("confirm") ?? "")) throw new Error("Passwords do not match.");
    data.passwordHash = await hashPassword(password);
    data.mustChangePassword = false; // they just chose their own
    await logAudit(prisma, { action: "PASSWORD_RESET", entityId: me.id, performedBy: me.id, actorName: me.name, newValue: "self-service" });
  }

  await prisma.user.update({ where: { id: me.id }, data });
  revalidatePath("/profile");
}
