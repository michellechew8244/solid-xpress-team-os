import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canApproveTasks } from "@/lib/rbac";
import { Card, PageHeader, Pill, SectionTitle } from "@/components/ui";
import {
  NewTrainingForm, AddMaterialForm, DeleteMaterialButton, ToggleTrainingButton, CompleteTrainingForm,
  AddQuizQuestionForm, ToggleQuestionButton, TakeQuizForm,
} from "@/components/TrainingForms";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function TrainingPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const canManage = canApproveTasks(user.role) || user.role === "HR_ADMIN";

  const [trainings, completions] = await Promise.all([
    prisma.training.findMany({
      where: canManage ? {} : { isActive: true },
      include: {
        materials: { orderBy: { createdAt: "asc" } },
        // Managers see all questions (incl. deactivated, for the toggle); staff
        // only get active ones and never see which option is correct.
        quizQuestions: { include: { options: true }, orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.trainingCompletion.findMany({ where: { userId: user.id } }),
  ]);
  const byId = new Map(completions.map((c) => [c.trainingId, c]));

  const relevant = trainings.filter(
    (t) => canManage || t.departmentEligibility === "ALL" || t.departmentEligibility === user.department?.code,
  );

  return (
    <>
      <PageHeader
        title="Training Centre"
        subtitle="Upskill, watch training video/slides, pass the quiz, earn points"
        action={canManage ? <NewTrainingForm /> : undefined}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {relevant.map((t) => {
          const c = byId.get(t.id);
          const video = t.materials.find((m) => m.kind === "VIDEO");
          const slides = t.materials.filter((m) => m.kind === "SLIDES");
          const activeQuestions = t.quizQuestions.filter((q) => q.isActive);
          const hasQuiz = activeQuestions.length > 0;

          return (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-ink">{t.title}</div>
                  <div className="text-xs text-ink-muted">
                    {t.departmentEligibility === "ALL" ? "All departments" : t.departmentEligibility} · pass {t.passingMark}% · +{t.pointsAward} pts
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {c ? <Pill value={c.passed ? "COMPLETED" : "IN_PROGRESS"} label={c.passed ? `Passed ${c.score}%` : c.status} /> : <Pill value="NOT_STARTED" label="Assigned" />}
                  {canManage && <ToggleTrainingButton id={t.id} active={t.isActive} />}
                </div>
              </div>
              {t.description && <p className="mt-2 text-sm text-ink-soft">{t.description}</p>}

              {/* Uploaded video plays inline */}
              {video && (
                <div className="mt-3">
                  <video controls className="w-full rounded-lg bg-black" src={video.url} preload="metadata" />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
                    <span>{video.filename} · {fmtBytes(video.sizeBytes)}</span>
                    {canManage && <DeleteMaterialButton attachmentId={video.id} />}
                  </div>
                </div>
              )}

              {/* Slide decks — download link (browsers can't render PPT inline) */}
              {slides.map((s) => (
                <div key={s.id} className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">📑 {s.filename} ({fmtBytes(s.sizeBytes)})</a>
                  {canManage && <DeleteMaterialButton attachmentId={s.id} />}
                </div>
              ))}

              <div className="mt-3 flex flex-wrap gap-2">
                {t.videoLink && <a href={t.videoLink} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">▶ External video</a>}
                {t.sopDocument && <a href={t.sopDocument} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">📄 External SOP</a>}
                {c?.proofUrl && <a href={c.proofUrl} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">🎓 My certificate</a>}
              </div>

              {/* Quiz session — shown after the material, before completion */}
              {!c?.passed && (
                <div className="mt-3">
                  {hasQuiz ? (
                    <TakeQuizForm
                      trainingId={t.id}
                      passingMark={t.passingMark}
                      questions={activeQuestions.map((q) => ({ id: q.id, question: q.question, options: q.options.map((o) => ({ id: o.id, label: o.label })) }))}
                    />
                  ) : (
                    !canManage && <CompleteTrainingForm trainingId={t.id} />
                  )}
                </div>
              )}

              {canManage && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <SectionTitle>🧠 Quiz ({activeQuestions.length} active)</SectionTitle>
                  <div className="space-y-2">
                    {t.quizQuestions.map((q, i) => (
                      <div key={q.id} className={`rounded-lg px-3 py-2 text-xs ${q.isActive ? "bg-slate-50" : "bg-slate-100 opacity-60"}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">{i + 1}. {q.question}</span>
                          <ToggleQuestionButton id={q.id} active={q.isActive} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {q.options.map((o) => (
                            <span key={o.id} className={`badge ${o.isCorrect ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>{o.isCorrect ? "✓ " : ""}{o.label}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {t.quizQuestions.length === 0 && <p className="text-xs text-ink-muted">No quiz questions yet — staff will complete this training manually.</p>}
                  </div>
                  <div className="mt-2"><AddQuizQuestionForm trainingId={t.id} /></div>
                </div>
              )}

              {canManage && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <AddMaterialForm trainingId={t.id} />
                </div>
              )}
            </Card>
          );
        })}
        {relevant.length === 0 && (
          <div className="col-span-full text-center text-sm text-ink-muted">No training assigned yet.</div>
        )}
      </div>
    </>
  );
}
