export interface LevelHistoryVM {
  id: string;
  fromLevel: number;
  toLevel: number;
  reason: string | null;
  approverName: string | null;
  bonusPointsAwarded: number;
  dateLabel: string;
}

/** Section 6 — My Growth History. */
export function LevelHistoryTimeline({ history }: { history: LevelHistoryVM[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-ink-muted">No level changes yet — keep growing to start your history!</p>;
  }
  return (
    <div className="space-y-2">
      {history.map((h) => (
        <div key={h.id} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="text-lg">🪜</div>
          <div>
            <div className="font-medium text-ink">{h.dateLabel} — Upgraded from Lv.{h.fromLevel} to Lv.{h.toLevel}</div>
            <div className="text-xs text-ink-muted">
              {h.reason ?? "Level requirements met"}
              {h.approverName ? ` · Approved by ${h.approverName}` : ""}
              {h.bonusPointsAwarded > 0 ? ` · +${h.bonusPointsAwarded} bonus pts` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
