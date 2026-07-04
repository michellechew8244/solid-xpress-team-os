"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canApproveTasks } from "@/lib/rbac";
import { saveUploadedFile, deleteUploadedFile, validateUpload, sanitize } from "@/lib/upload";
import { createUploadTicket, deleteStoredFile, isCloudStorageConfigured, type UploadTicket } from "@/lib/storage";
import { awardPoints } from "@/lib/points";
import { notify } from "@/lib/notify";

/** Who can create/manage training content (upload video/PPT, edit, retire). */
function canManageTraining(role: string) {
  return canApproveTasks(role) || role === "HR_ADMIN"; // Boss, Management, Dept Head, HR
}

async function actor() {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  return s;
}

/**
 * Issue a signed URL so the browser can upload a file DIRECTLY to Supabase
 * Storage (bypassing Vercel's ~4.5MB request cap). Validates the declared
 * size/type server-side; the client then PUTs the file and passes the
 * resulting public URL back through the normal form action.
 */
export async function requestUploadTicket(
  category: "video" | "slides" | "proof" | "document",
  filename: string,
  sizeBytes: number,
  mimeType: string,
): Promise<UploadTicket | null> {
  const me = await actor();
  // Training material (video/slides) is manager-only; completion proof and
  // work-report documents can be uploaded by any signed-in user.
  if (category !== "proof" && category !== "document" && !canManageTraining(me.role)) throw new Error("Forbidden");
  if (!isCloudStorageConfigured()) return null; // caller falls back to form-post upload (local dev)
  validateUpload(category, sizeBytes, mimeType);
  const subdir = category === "proof" ? "training-proof" : category === "document" ? "work-reports" : "training";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return createUploadTicket(`${subdir}/${unique}-${sanitize(filename || "file")}`);
}

/** Create a training topic/folder (managers). */
export async function createTrainingTopic(formData: FormData) {
  const me = await actor();
  if (!canManageTraining(me.role)) throw new Error("Forbidden");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Topic name is required.");
  const icon = String(formData.get("icon") ?? "📁").trim() || "📁";
  const count = await prisma.trainingTopic.count();
  await prisma.trainingTopic.create({ data: { name, icon, description: String(formData.get("description") ?? "") || null, order: count, createdById: me.id } });
  revalidatePath("/training");
}

export async function toggleTrainingTopic(id: string, active: boolean) {
  const me = await actor();
  if (!canManageTraining(me.role)) throw new Error("Forbidden");
  await prisma.trainingTopic.update({ where: { id }, data: { isActive: active } });
  revalidatePath("/training");
}

/** Create a new training, optionally uploading a video and/or slides deck. */
export async function createTraining(formData: FormData) {
  const me = await actor();
  if (!canManageTraining(me.role)) throw new Error("Forbidden");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Training title is required.");

  const training = await prisma.training.create({
    data: {
      title,
      topicId: String(formData.get("topicId") ?? "") || null,
      departmentEligibility: String(formData.get("departmentEligibility") ?? "ALL"),
      description: String(formData.get("description") ?? "") || null,
      videoLink: String(formData.get("videoLink") ?? "") || null,
      sopDocument: String(formData.get("sopDocument") ?? "") || null,
      passingMark: Number(formData.get("passingMark") ?? 70),
      pointsAward: Number(formData.get("pointsAward") ?? 20),
      createdById: me.id,
    },
  });

  await attachIfPresent(formData, "videoFile", training.id, me.id);
  await attachIfPresent(formData, "slidesFile", training.id, me.id);

  revalidatePath("/training");
}

/** Add extra material (video or slides) to an existing training. */
export async function addTrainingMaterial(formData: FormData) {
  const me = await actor();
  if (!canManageTraining(me.role)) throw new Error("Forbidden");

  const trainingId = String(formData.get("trainingId") ?? "");
  if (!trainingId) return;

  const addedVideo = await attachIfPresent(formData, "videoFile", trainingId, me.id);
  const addedSlides = await attachIfPresent(formData, "slidesFile", trainingId, me.id);
  if (!addedVideo && !addedSlides) throw new Error("Choose a video or slides file to upload.");

  revalidatePath("/training");
}

async function attachIfPresent(
  formData: FormData,
  field: "videoFile" | "slidesFile",
  trainingId: string,
  uploaderId: string,
): Promise<boolean> {
  const category = field === "videoFile" ? "video" : "slides";

  // Preferred path: the browser already uploaded straight to cloud storage via
  // requestUploadTicket() and passes the resulting URL + metadata here.
  const preUploadedUrl = String(formData.get(`${field}Url`) ?? "");
  if (preUploadedUrl) {
    await prisma.attachment.create({
      data: {
        filename: String(formData.get(`${field}Name`) ?? "file"),
        url: preUploadedUrl,
        mimeType: String(formData.get(`${field}Type`) ?? "") || "application/octet-stream",
        sizeBytes: Number(formData.get(`${field}Size`) ?? 0),
        kind: category.toUpperCase(),
        uploadedById: uploaderId,
        trainingId,
      },
    });
    return true;
  }

  // Fallback: raw file in the form post (local dev without cloud storage).
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) return false;
  const saved = await saveUploadedFile(file, "training", category);
  await prisma.attachment.create({
    data: {
      filename: saved.filename,
      url: saved.url,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      kind: category.toUpperCase(),
      uploadedById: uploaderId,
      trainingId,
    },
  });
  return true;
}

/** Remove an uploaded material file (DB row + the file on disk). */
export async function deleteTrainingMaterial(attachmentId: string) {
  const me = await actor();
  if (!canManageTraining(me.role)) throw new Error("Forbidden");

  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att || !att.trainingId) return;
  await prisma.attachment.delete({ where: { id: attachmentId } });
  // Route the delete to wherever the file actually lives.
  if (att.url.startsWith("/uploads/")) await deleteUploadedFile(att.url);
  else await deleteStoredFile(att.url);
  revalidatePath("/training");
}

export async function toggleTraining(id: string, active: boolean) {
  const me = await actor();
  if (!canManageTraining(me.role)) throw new Error("Forbidden");
  await prisma.training.update({ where: { id }, data: { isActive: active } });
  revalidatePath("/training");
}

/**
 * Staff self-reports completion (score + optional proof upload, e.g. a quiz
 * certificate screenshot). Passing awards points once (idempotent).
 */
export async function submitCompletion(formData: FormData) {
  const me = await actor();
  const trainingId = String(formData.get("trainingId") ?? "");
  const score = Math.max(0, Math.min(100, Number(formData.get("score") ?? 0)));

  const training = await prisma.training.findUnique({ where: { id: trainingId } });
  if (!training) throw new Error("Training not found");

  const existing = await prisma.trainingCompletion.findUnique({ where: { trainingId_userId: { trainingId, userId: me.id } } });
  if (existing?.passed) return; // already passed — idempotent

  let proofUrl = existing?.proofUrl ?? null;
  // Preferred: proof already uploaded straight to cloud storage by the browser.
  const preUploaded = String(formData.get("proofFileUrl") ?? "");
  if (preUploaded) {
    proofUrl = preUploaded;
  } else {
    const proofFile = formData.get("proofFile");
    if (proofFile instanceof File && proofFile.size > 0) {
      const saved = await saveUploadedFile(proofFile, "training-proof", "proof");
      proofUrl = saved.url;
    }
  }

  const passed = score >= training.passingMark;
  await prisma.trainingCompletion.upsert({
    where: { trainingId_userId: { trainingId, userId: me.id } },
    create: { trainingId, userId: me.id, score, passed, status: passed ? "PASSED" : "FAILED", completedAt: new Date(), proofUrl, fromQuiz: false },
    update: { score, passed, status: passed ? "PASSED" : "FAILED", completedAt: new Date(), proofUrl, fromQuiz: false },
  });

  if (passed) await awardTrainingPointsOnce(training.id, me.id, training.title, training.pointsAward);
  revalidatePath("/training");
}

/** Award training points once per user, guarding against double-award races. */
async function awardTrainingPointsOnce(trainingId: string, userId: string, title: string, points: number) {
  if (points <= 0) return;
  const already = await prisma.pointsTransaction.findFirst({ where: { userId, refType: "TRAINING", refId: trainingId } });
  if (already) return;
  await awardPoints(prisma, { userId, amount: points, type: "SOP", reason: `Training passed: ${title}`, refType: "TRAINING", refId: trainingId });
  await notify(prisma, { userId, type: "POINTS_AWARDED", title: `Training passed 🎓 +${points} pts`, body: title, link: "/training" });
}

// ===========================================================================
// Quiz — question bank management (managers) + attempt submission (staff)
// ===========================================================================

/** Add a multiple-choice question (2–5 options, one marked correct). */
export async function addQuizQuestion(formData: FormData) {
  const me = await actor();
  if (!canManageTraining(me.role)) throw new Error("Forbidden");

  const trainingId = String(formData.get("trainingId") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  if (!trainingId || !question) throw new Error("Question text is required.");

  const options: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const v = String(formData.get(`option${i}`) ?? "").trim();
    if (v) options.push(v);
  }
  if (options.length < 2) throw new Error("Provide at least 2 answer options.");

  const correctIndex = Number(formData.get("correctOption") ?? 1) - 1;
  if (correctIndex < 0 || correctIndex >= options.length) throw new Error("Select which option is correct.");

  const order = await prisma.quizQuestion.count({ where: { trainingId } });
  await prisma.quizQuestion.create({
    data: {
      trainingId,
      question,
      order,
      options: { create: options.map((label, i) => ({ label, isCorrect: i === correctIndex, order: i })) },
    },
  });
  revalidatePath("/training");
}

/** Soft-delete (or restore) a question — preserves historical answers. */
export async function toggleQuizQuestion(id: string, active: boolean) {
  const me = await actor();
  if (!canManageTraining(me.role)) throw new Error("Forbidden");
  await prisma.quizQuestion.update({ where: { id }, data: { isActive: active } });
  revalidatePath("/training");
}

/**
 * Staff submits answers to a training's quiz. Auto-grades against the active
 * question bank, records the attempt, and — on a passing score — upserts the
 * TrainingCompletion and awards points (idempotent, mirrors submitCompletion).
 */
export async function submitQuizAttempt(formData: FormData) {
  const me = await actor();
  const trainingId = String(formData.get("trainingId") ?? "");

  const [training, existing, questions] = await Promise.all([
    prisma.training.findUnique({ where: { id: trainingId } }),
    prisma.trainingCompletion.findUnique({ where: { trainingId_userId: { trainingId, userId: me.id } } }),
    prisma.quizQuestion.findMany({ where: { trainingId, isActive: true }, include: { options: true }, orderBy: { order: "asc" } }),
  ]);
  if (!training) throw new Error("Training not found");
  if (existing?.passed) return { score: existing.score, passed: true, correctCount: 0, totalQuestions: 0 };
  if (questions.length === 0) throw new Error("This training has no quiz questions yet.");

  let correctCount = 0;
  const answerRows: { questionId: string; selectedOptionId: string | null; isCorrect: boolean }[] = [];
  for (const q of questions) {
    const selectedOptionId = String(formData.get(`q_${q.id}`) ?? "") || null;
    const selected = q.options.find((o) => o.id === selectedOptionId);
    const isCorrect = !!selected?.isCorrect;
    if (isCorrect) correctCount++;
    answerRows.push({ questionId: q.id, selectedOptionId, isCorrect });
  }

  const total = questions.length;
  const score = Math.round((correctCount / total) * 100);
  const passed = score >= training.passingMark;

  await prisma.$transaction(async (tx) => {
    const attempt = await tx.quizAttempt.create({
      data: { trainingId, userId: me.id, score, passed, totalQuestions: total, correctCount },
    });
    await tx.quizAnswer.createMany({
      data: answerRows.map((a) => ({ attemptId: attempt.id, ...a })),
    });
    await tx.trainingCompletion.upsert({
      where: { trainingId_userId: { trainingId, userId: me.id } },
      create: { trainingId, userId: me.id, score, passed, status: passed ? "PASSED" : "FAILED", completedAt: new Date(), fromQuiz: true },
      update: { score, passed, status: passed ? "PASSED" : "FAILED", completedAt: new Date(), fromQuiz: true },
    });
  });

  if (passed) await awardTrainingPointsOnce(training.id, me.id, training.title, training.pointsAward);
  revalidatePath("/training");
  return { score, passed, correctCount, totalQuestions: total };
}
