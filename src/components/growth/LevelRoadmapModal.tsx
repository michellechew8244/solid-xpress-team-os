"use client";

import { Progress } from "@/components/ui";
import { LevelStatusPill, type LevelState } from "./LevelStatusPill";
import type { ChecklistItem } from "@/services/growth";

export interface RoadmapRuleVM {
  levelNumber: number;
  levelName: string;
  description: string | null;
  bonusPoints: number;
  rewardDescription: string | null;
  requiresManagerApproval: boolean;
  requiresHRApproval: boolean;
  requiresBossApproval: boolean;
}

const STATE_MESSAGE: Record<LevelState, string> = {
  completed: "You have unlocked this level.",
  current: "This is your current level.",
  ready: "You have completed all requirements. Claim your level upgrade now.",
  locked: "Complete the requirements to unlock this level.",
};

export function LevelRoadmapModal({
  open, onClose, rule, levelState, checklist,
}: {
  open: boolean;
  onClose: () => void;
  rule: RoadmapRuleVM;
  levelState: LevelState;
  checklist: ChecklistItem[];
}) {
  if (!open) return null;
  const rewards = (rule.rewardDescription ?? "").split("\n").filter(Boolean);
  const approvalNote = rule.requiresBossApproval ? "Boss approval required" : rule.requiresHRApproval ? "HR approval required" : rule.requiresManagerApproval ? "Department Head approval required" : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">Level {rule.levelNumber}</div>
            <h2 className="text-xl font-bold text-ink">{rule.levelName}</h2>
          </div>
          <LevelStatusPill state={levelState} />
        </div>
        {rule.description && <p className="mt-2 text-sm text-ink-soft">{rule.description}</p>}

        {rule.levelNumber === 1 ? (
          <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
            This is the starting level for every Solid Xpress team member — no requirements, just get going!
          </p>
        ) : (
          <>
            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">Criteria to Unlock</div>
              <div className="mt-2 space-y-2">
                {checklist.map((c) => (
                  <div key={c.key} className="rounded-lg bg-slate-50 p-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">{c.met ? "✅" : "⬜"} {c.label}</span>
                      <span className="text-xs text-ink-muted">{c.currentLabel} / {c.requiredLabel}</span>
                    </div>
                    <div className="mt-1"><Progress value={c.progressPct} rag={c.met ? "ok" : "warn"} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                levelState === "completed" ? "bg-green-50 text-green-700" : levelState === "ready" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {STATE_MESSAGE[levelState]}
            </div>
          </>
        )}

        {rewards.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">Rewards Unlocked</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
              {rewards.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}
        {rule.bonusPoints > 0 && (
          <p className="mt-2 text-xs text-ink-muted">🎁 +{rule.bonusPoints} bonus points on upgrade{approvalNote ? ` (${approvalNote})` : ""}</p>
        )}

        <button className="btn-ghost mt-5 w-full" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
