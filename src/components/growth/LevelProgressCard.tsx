import { Card, Progress } from "@/components/ui";
import { ClaimLevelUpgradeButton } from "./ClaimLevelUpgradeButton";
import type { LevelProgress } from "@/services/growth";

/** Section 1 — Current Level Progress Card. */
export function LevelProgressCard({ progress }: { progress: LevelProgress }) {
  const isMax = !progress.targetLevel;
  const pointsItem = progress.checklist.find((c) => c.key === "points");

  return (
    <Card className="border-l-4 border-l-brand-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">Current Level</div>
          <div className="text-xl font-bold text-ink">Lv.{progress.currentLevel} — {progress.currentLevelName}</div>
        </div>
        {!isMax && (
          <div className="text-right">
            <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">Next Level</div>
            <div className="text-lg font-bold text-brand-700">Lv.{progress.targetLevel} — {progress.targetLevelName}</div>
          </div>
        )}
      </div>

      {isMax ? (
        <p className="mt-4 text-sm text-ink-soft">🏆 You&apos;ve reached the top of the Growth Roadmap — Solid Xpress Elite. Keep setting the standard!</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-soft">
            You are Lv.{progress.currentLevel} — {progress.currentLevelName}.{" "}
            {progress.isReadyToUpgrade ? (
              <span className="font-semibold text-ok">Congratulations! You are ready to level up.</span>
            ) : (
              <>You need {summarizeMissing(progress)} to unlock Lv.{progress.targetLevel} — {progress.targetLevelName}.</>
            )}
          </p>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
              <span>{progress.lifetimePoints.toLocaleString()} / {pointsItem?.requiredLabel ?? "—"} lifetime points</span>
              <span>{progress.progressPercent}% completed</span>
            </div>
            <Progress value={progress.progressPercent} rag={progress.progressPercent >= 100 ? "ok" : progress.progressPercent >= 60 ? "warn" : "danger"} />
          </div>

          {progress.missing.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase text-ink-muted">Missing Requirements</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-soft">
                {progress.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a href="#growth-levels" className="btn-ghost">View Roadmap</a>
            <a href="#next-level-checklist" className="btn-ghost">How to Level Up</a>
            {progress.isReadyToUpgrade && progress.targetLevel && progress.targetLevelName && (
              <ClaimLevelUpgradeButton nextLevel={progress.targetLevel} nextLevelName={progress.targetLevelName} />
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function summarizeMissing(progress: LevelProgress): string {
  const parts = progress.checklist.filter((c) => !c.met).map((c) => `${c.requiredLabel} ${c.label.toLowerCase()}`);
  if (parts.length === 0) return "a few more requirements";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
