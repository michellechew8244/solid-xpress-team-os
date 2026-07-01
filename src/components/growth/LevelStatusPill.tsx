export type LevelState = "completed" | "current" | "ready" | "locked";

const LABELS: Record<LevelState, string> = {
  completed: "Completed",
  current: "Current",
  ready: "Ready to Unlock",
  locked: "Locked",
};
const STYLES: Record<LevelState, string> = {
  completed: "bg-green-100 text-green-700",
  current: "bg-brand-100 text-brand-700",
  ready: "bg-amber-100 text-amber-700",
  locked: "bg-slate-200 text-slate-500",
};

export function LevelStatusPill({ state }: { state: LevelState }) {
  return <span className={`badge ${STYLES[state]}`}>{LABELS[state]}</span>;
}
