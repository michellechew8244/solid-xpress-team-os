"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { validatePassword } from "@/lib/user-permissions";
import { sanitize } from "@/lib/upload";
import { uploadBufferToStorage, isCloudStorageConfigured } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const PHOTO_MAX = 3 * 1024 * 1024; // 3MB — passes through the server action
const PHOTO_MIME = ["image/png", "image/jpeg", "image/webp"];

/**
 * Public self-signup: creates a PENDING account that CANNOT log in until
 * management approves it (accessStatus stays INACTIVE, which the login
 * authorize() gate already rejects).
 */
export async function signUp(formData: FormData): Promise<{ ok: true }> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const dobRaw = String(formData.get("dateOfBirth") ?? "");
  const nationalId = String(formData.get("nationalId") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim() || null;
  const departmentId = String(formData.get("departmentId") ?? "") || null;

  if (!name) throw new Error("Your full name is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  const pwErr = validatePassword(password);
  if (pwErr) throw new Error(pwErr);
  if (password !== confirm) throw new Error("Passwords do not match.");
  const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? new Date(`${dobRaw}T00:00:00Z`) : null;
  if (!dateOfBirth || isNaN(dateOfBirth.getTime())) throw new Error("Pick your date of birth.");
  if (!nationalId) throw new Error("Your IC / ID number is required.");

  if (await prisma.user.findUnique({ where: { email } })) {
    throw new Error("An account with this email already exists — try logging in instead.");
  }

  // Optional profile photo (small; uploaded server-side since there's no session yet).
  let avatarUrl: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > PHOTO_MAX) throw new Error("Profile photo must be under 3MB.");
    if (photo.type && !PHOTO_MIME.includes(photo.type)) throw new Error("Profile photo must be PNG/JPG/WebP.");
    if (isCloudStorageConfigured()) {
      const path = `signup-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitize(photo.name || "photo")}`;
      avatarUrl = await uploadBufferToStorage(path, Buffer.from(await photo.arrayBuffer()), photo.type || "image/jpeg");
    }
  }

  const user = await prisma.user.create({
    data: {
      name, email, passwordHash: await hashPassword(password),
      dateOfBirth, nationalId, phoneNumber, departmentId, avatarUrl,
      role: "STAFF", employmentStatus: "PROBATION",
      // Locked out until management approves.
      signupStatus: "PENDING", accessStatus: "INACTIVE", isActive: false,
      profile: { create: { onboardingProgress: 0 } },
    },
  });

  await logAudit(prisma, { action: "SIGNUP_REQUESTED", entityId: user.id, entityType: "USER", performedBy: user.id, affectedUserId: user.id, newValue: { name, email, departmentId } });
  const bosses = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGEMENT"] } }, select: { id: true } });
  await Promise.all(bosses.map((b) => notify(prisma, { userId: b.id, type: "ANNOUNCEMENT", title: "🆕 New sign-up awaiting approval", body: `${name} (${email}) registered and is waiting for your approval.`, link: "/users" })));
  return { ok: true };
}

