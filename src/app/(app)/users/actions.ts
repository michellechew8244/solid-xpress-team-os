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

async function actor() {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  return s;
}

/** Create a new staff user (Boss / HR). Auto-creates the points wallet + profile. */
export async function createUser(formData: FormData) {
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
      employmentType: String(formData.get("employmentType") ?? "FULL_TIME"),
      employmentStatus: String(formData.get("employmentStatus") ?? "PROBATION"),
      accessStatus: "ACTIVE",
      isActive: true,
      joinDate: formData.get("joinDate") ? new Date(String(formData.get("joinDate"))) : new Date(),
      createdBy: me.id,
      updatedBy: me.id,
      // Points wallet is denormalised on the user (defaults to 0) — created here.
      profile: { create: { onboardingProgress: 0 } },
    },
  });

  await logAudit(prisma, { action: "USER_CREATED", entityId: user.id, performedBy: me.id, actorName: me.name, newValue: { email, name, role, departmentId } });
  revalidatePath("/users");
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

  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), updatedBy: me.id } });
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
    await logAudit(prisma, { action: "PASSWORD_RESET", entityId: me.id, performedBy: me.id, actorName: me.name, newValue: "self-service" });
  }

  await prisma.user.update({ where: { id: me.id }, data });
  revalidatePath("/profile");
}
