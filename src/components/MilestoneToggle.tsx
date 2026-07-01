"use client";

import { useTransition } from "react";
import { toggleMilestone } from "@/app/(app)/jobs/actions";

export function MilestoneToggle({ id, jobId, label, done, doneAt }: { id: string; jobId: string; label: string; done: boolean; doneAt?: string | null }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-3 py-1.5">
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        onChange={(e) => start(() => toggleMilestone(id, jobId, e.target.checked))}
        className="h-4 w-4 rounded border-slate-300"
      />
      <span className={`text-sm ${done ? "font-medium text-ink" : "text-ink-muted"}`}>{label}</span>
      {doneAt && <span className="ml-auto text-xs text-ink-muted">{doneAt}</span>}
    </label>
  );
}
