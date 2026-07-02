"use client";

import { useRef, useState, useTransition } from "react";
import {
  createTraining, addTrainingMaterial, deleteTrainingMaterial, toggleTraining, submitCompletion,
  addQuizQuestion, toggleQuizQuestion, submitQuizAttempt,
} from "@/app/(app)/training/actions";
import { stageUploads } from "@/lib/upload-client";
import { FileDropZone } from "@/components/FileDropZone";

const DEPTS = ["ALL", "MKT", "SALES", "CS", "OPS", "FWD", "HAUL", "RUN", "DISP", "FIN", "HR"];

export function NewTrainingForm() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <div>
      <button className="btn-primary w-full sm:w-auto" onClick={() => setOpen((o) => !o)}>＋ New Training</button>
      {open && (
        <form
          ref={ref}
          action={(fd) => start(async () => { setErr(null); try { await stageUploads(fd, [{ field: "videoFile", category: "video" }, { field: "slidesFile", category: "slides" }]); await createTraining(fd); ref.current?.reset(); setOpen(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          className="card mt-3 grid gap-3 p-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2"><label className="label">Title *</label><input name="title" className="input" required /></div>
          <div>
            <label className="label">Department eligibility</label>
            <select name="departmentEligibility" className="input" defaultValue="ALL">{DEPTS.map((d) => <option key={d} value={d}>{d === "ALL" ? "All departments" : d}</option>)}</select>
          </div>
          <div><label className="label">Passing mark (%)</label><input name="passingMark" type="number" className="input" defaultValue={70} /></div>
          <div><label className="label">Points on pass</label><input name="pointsAward" type="number" className="input" defaultValue={20} /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><input name="description" className="input" /></div>

          <div className="sm:col-span-2 mt-2 border-t border-slate-100 pt-3 text-xs font-semibold uppercase text-ink-muted">Upload material</div>
          <FileDropZone
            name="videoFile"
            accept="video/mp4,video/webm,video/ogg,video/quicktime"
            label="🎬 Video file"
            hint="mp4/webm · max 150MB"
          />
          <FileDropZone
            name="slidesFile"
            accept=".ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
            label="📑 Slides (PPT/PDF)"
            hint="max 25MB"
          />
          <div><label className="label">Or external video link</label><input name="videoLink" className="input" placeholder="https://youtube.com/…" /></div>
          <div><label className="label">Or external SOP link</label><input name="sopDocument" className="input" placeholder="https://…" /></div>

          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</div>}
          <div className="flex items-center gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={pending}>{pending ? "Uploading…" : "Create Training"}</button>
            <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AddMaterialForm({ trainingId }: { trainingId: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <div>
      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen((o) => !o)}>＋ Add material</button>
      {open && (
        <form
          ref={ref}
          action={(fd) => start(async () => { setErr(null); try { await stageUploads(fd, [{ field: "videoFile", category: "video" }, { field: "slidesFile", category: "slides" }]); await addTrainingMaterial(fd); ref.current?.reset(); setOpen(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3"
        >
          <input type="hidden" name="trainingId" value={trainingId} />
          <FileDropZone name="videoFile" accept="video/mp4,video/webm,video/ogg,video/quicktime" label="🎬 Video file" hint="mp4/webm · max 150MB" />
          <FileDropZone name="slidesFile" accept=".ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf" label="📑 Slides (PPT/PDF)" hint="max 25MB" />
          {err && <div className="rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">{err}</div>}
          <div className="flex gap-2"><button className="btn-primary px-3 py-1 text-xs" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button><button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function DeleteMaterialButton({ attachmentId }: { attachmentId: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-xs text-danger hover:underline" disabled={pending} onClick={() => start(() => deleteTrainingMaterial(attachmentId))}>
      remove
    </button>
  );
}

export function ToggleTrainingButton({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className={`badge ${active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`} disabled={pending} onClick={() => start(() => toggleTraining(id, !active))}>
      {active ? "Active" : "Inactive"}
    </button>
  );
}

export function CompleteTrainingForm({ trainingId, defaultScore }: { trainingId: string; defaultScore?: number }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <div>
      <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setOpen((o) => !o)}>Mark as complete</button>
      {open && (
        <form
          ref={ref}
          action={(fd) => start(async () => { setErr(null); try { await stageUploads(fd, [{ field: "proofFile", category: "proof" }]); await submitCompletion(fd); ref.current?.reset(); setOpen(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3"
        >
          <input type="hidden" name="trainingId" value={trainingId} />
          <div><label className="label">Quiz score (%)</label><input name="score" type="number" min={0} max={100} defaultValue={defaultScore ?? 100} className="input" required /></div>
          <FileDropZone name="proofFile" accept="image/png,image/jpeg,image/webp,application/pdf" capture="environment" label="Certificate / proof (optional)" hint="image or PDF · max 10MB" />
          {err && <div className="rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">{err}</div>}
          <div className="flex gap-2"><button className="btn-primary px-3 py-1 text-xs" disabled={pending}>{pending ? "Submitting…" : "Submit"}</button><button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

// ===========================================================================
// Quiz builder (managers) + quiz taking (staff)
// ===========================================================================

export function AddQuizQuestionForm({ trainingId }: { trainingId: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <div>
      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen((o) => !o)}>＋ Add question</button>
      {open && (
        <form
          ref={ref}
          action={(fd) => start(async () => { setErr(null); try { await addQuizQuestion(fd); ref.current?.reset(); setOpen(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3"
        >
          <input type="hidden" name="trainingId" value={trainingId} />
          <div><label className="label">Question</label><input name="question" className="input" required /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <input key={i} name={`option${i}`} className="input" placeholder={`Option ${i}${i <= 2 ? " *" : ""}`} required={i <= 2} />
            ))}
          </div>
          <div>
            <label className="label">Correct option</label>
            <select name="correctOption" className="input" defaultValue="1">{[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>Option {i}</option>)}</select>
          </div>
          {err && <div className="rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">{err}</div>}
          <div className="flex gap-2"><button className="btn-primary px-3 py-1 text-xs" disabled={pending}>{pending ? "Saving…" : "Add question"}</button><button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function ToggleQuestionButton({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-xs text-ink-muted hover:underline" disabled={pending} onClick={() => start(() => toggleQuizQuestion(id, !active))}>
      {active ? "deactivate" : "reactivate"}
    </button>
  );
}

export interface QuizQuestionForTaking {
  id: string;
  question: string;
  options: { id: string; label: string }[];
}

/** Full quiz-taking flow: renders all questions, submits, shows the graded result inline. */
export function TakeQuizForm({ trainingId, questions, passingMark }: { trainingId: string; questions: QuizQuestionForTaking[]; passingMark: number }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; passed: boolean; correctCount: number; totalQuestions: number } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setOpen((o) => !o)}>📝 Take Quiz ({questions.length} Qs)</button>
      {open && (
        <form
          action={(fd) => start(async () => {
            setErr(null);
            try {
              const r = await submitQuizAttempt(fd);
              setResult(r);
            } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
          })}
          className="mt-3 space-y-4 rounded-lg bg-slate-50 p-4"
        >
          <input type="hidden" name="trainingId" value={trainingId} />
          {questions.map((q, qi) => (
            <div key={q.id}>
              <div className="text-sm font-semibold text-ink">{qi + 1}. {q.question}</div>
              <div className="mt-1 space-y-1">
                {q.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm text-ink-soft">
                    <input type="radio" name={`q_${q.id}`} value={o.id} required className="h-4 w-4" />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-ink-muted">Passing mark: {passingMark}%</p>
          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          {result && (
            <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${result.passed ? "bg-green-50 text-green-700" : "bg-rose-50 text-rose-700"}`}>
              {result.passed ? "🎉 Passed!" : "Not quite — try again."} Score {result.score}% ({result.correctCount}/{result.totalQuestions} correct)
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary px-3 py-1.5 text-xs" disabled={pending}>{pending ? "Grading…" : "Submit answers"}</button>
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>Close</button>
          </div>
        </form>
      )}
    </div>
  );
}
