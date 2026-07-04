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

export type SignupResult = { ok: true } | { ok: false; error: string };

/**
 * Public self-signup: creates a PENDING account that CANNOT log in until
 * management approves it (accessStatus stays INACTIVE, which the login
 * authorize() gate already rejects).
 *
 * Returns { ok:false, error } instead of throwing — Next.js redacts thrown
 * server-action errors in production, so the staff member would only see a
 * useless "Server Components render" message.
 */
export async function signUp(formData: FormData): Promise<SignupResult> {
  const fail = (error: string): SignupResult => ({ ok: false, error });
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const dobRaw = String(formData.get("dateOfBirth") ?? "");
  const nationalId = String(formData.get("nationalId") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim() || null;
  const departmentId = String(formData.get("departmentId") ?? "") || null;

  if (!name) return fail("Your full name is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address.");
  const pwErr = validatePassword(password);
  if (pwErr) return fail(pwErr);
  if (password !== confirm) return fail("Passwords do not match.");
  const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? new Date(`${dobRaw}T00:00:00Z`) : null;
  if (!dateOfBirth || isNaN(dateOfBirth.getTime())) return fail("Pick your date of birth.");
  if (!nationalId) return fail("Your IC / ID number is required.");

  if (await prisma.user.findUnique({ where: { email } })) {
    return fail("An account with this email already exists — try logging in instead.");
  }

  // Profile photo → avatar (required; uploaded server-side since there's no session yet).
  let avatarUrl: string | null = null;
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return fail("Please take or choose a profile photo — it becomes your avatar in the app.");
  if (photo.size > PHOTO_MAX) return fail("Profile photo must be under 3MB.");
  if (photo.type && !PHOTO_MIME.includes(photo.type)) return fail("Profile photo must be PNG/JPG/WebP.");
  if (isCloudStorageConfigured()) {
    const path = `signup-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitize(photo.name || "photo")}`;
    try {
      avatarUrl = await uploadBufferToStorage(path, Buffer.from(await photo.arrayBuffer()), photo.type || "image/jpeg");
    } catch {
      return fail("Photo upload failed — please try a smaller photo or try again.");
    }
  }

  try {
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
  } catch (e) {
    console.error("signUp failed:", e);
    return fail("Something went wrong creating your account — please try again, or ask HR to create it for you.");
  }
}

