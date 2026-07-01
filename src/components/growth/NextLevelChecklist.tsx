import { Progress } from "@/components/ui";
import type { LevelProgress } from "@/services/growth";

/** Section 3 — Your Next Level Checklist. */
export function NextLevelChecklist({ progress }: { progress: LevelProgress }) {
  if (!progress.targetLevel) {
    return <p className="text-sm text-ink-muted">You&apos;ve reached the top of the roadmap — nothing left to unlock!</p>;
  }
  return (
    <div className="space-y-2">
      {progress.checklist.map((c) => (
        <div key={c.key} className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-medium text-ink">
              {c.met ? <span className="text-ok">✔</span> : c.progressPct > 0 ? <span className="text-warn">◐</span> : <span className="text-ink-muted">○</span>}
              {c.label}
            </span>
            <span className={`badge ${c.met ? "bg-green-100 text-green-700" : c.progressPct > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}`}>
              {c.met ? "Completed" : c.progressPct > 0 ? "In Progress" : "Not Yet"}
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">Required: {c.requiredLabel} · Current: {c.currentLabel}</div>
          <div className="mt-1.5"><Progress value={c.progressPct} rag={c.met ? "ok" : "warn"} /></div>
        </div>
      ))}
    </div>
  );
}
