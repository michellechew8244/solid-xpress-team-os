/** Section 5 — per-level rewards/privileges card. */
export function LevelRewardCard({
  levelNumber, levelName, rewardDescription, unlocked,
}: {
  levelNumber: number;
  levelName: string;
  rewardDescription: string | null;
  unlocked: boolean;
}) {
  const rewards = (rewardDescription ?? "").split("\n").filter(Boolean);
  return (
    <div className={`rounded-xl border p-4 ${unlocked ? "border-brand-200 bg-brand-50/40" : "border-slate-200 bg-slate-50 opacity-70"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-ink">Lv.{levelNumber} {levelName}</div>
        {unlocked ? <span className="badge bg-green-100 text-green-700">Unlocked</span> : <span className="badge bg-slate-200 text-slate-500">🔒 Locked</span>}
      </div>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-soft">
        {rewards.map((r) => <li key={r}>{r}</li>)}
      </ul>
    </div>
  );
}
