import { Progress } from "@/components/ui";

export interface BadgeRoadmapItem {
  id: string;
  name: string;
  description: string;
  criteria: string;
  icon: string;
  pointsBonus: number;
  departmentEligibility: string;
  earnedCount: number;
  earned: boolean;
  earnedDate: string | null;
  note: string | null;
}

/**
 * Badge Roadmap — presents the badge collection as a milestone journey rather
 * than a flat grid. Badges are ordered from most-commonly-earned (entry
 * milestones) to rarest (prestige), so the trail reads as a natural path. The
 * caller decides the order; this component only renders it as a connected rail
 * with earned / next-up / locked states.
 */
/** Relative rarity label + pill style, based on how many teammates hold a badge. */
function rarity(earnedCount: number, maxEarned: number): { label: string; className: string } {
  if (earnedCount === 0) return { label: "Unclaimed", className: "bg-amber-100 text-amber-700" };
  const ratio = maxEarned > 0 ? earnedCount / maxEarned : 0;
  if (ratio >= 0.6) return { label: "Common", className: "bg-slate-100 text-slate-600" };
  if (ratio >= 0.25) return { label: "Rare", className: "bg-indigo-100 text-indigo-700" };
  return { label: "Legendary", className: "bg-fuchsia-100 text-fuchsia-700" };
}

export function BadgeRoadmap({ items }: { items: BadgeRoadmapItem[] }) {
  const total = items.length;
  const earnedTotal = items.filter((b) => b.earned).length;
  const pct = total > 0 ? Math.round((earnedTotal / total) * 100) : 0;
  const maxEarned = items.reduce((m, b) => Math.max(m, b.earnedCount), 0);
  // The first not-yet-earned badge along the trail is highlighted as "next up".
  const nextUpId = items.find((b) => !b.earned)?.id ?? null;

  return (
    <div>
      {/* Collection progress header */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-gradient-to-r from-brand-50 to-white p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm font-bold text-ink">🏅 Badge Collection</div>
            <div className="text-xs text-ink-muted">Earn recognition for skill, reliability and teamwork.</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-brand-700">{earnedTotal}<span className="text-base text-ink-muted">/{total}</span></div>
            <div className="text-xs text-ink-muted">{pct}% collected</div>
          </div>
        </div>
        <div className="mt-3"><Progress value={pct} rag="ok" /></div>
      </div>

      {/* Vertical milestone trail */}
      <ol className="relative space-y-3">
        {items.map((b, i) => {
          const isNext = b.id === nextUpId;
          const isLast = i === items.length - 1;
          const rar = rarity(b.earnedCount, maxEarned);
          return (
            <li key={b.id} className="relative flex gap-3">
              {/* Rail: node + connecting line */}
              <div className="flex flex-col items-center">
                <span
                  className={
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ring-2 " +
                    (b.earned
                      ? "bg-green-50 ring-ok"
                      : isNext
                        ? "bg-brand-50 ring-brand-400"
                        : "bg-slate-100 ring-slate-200 grayscale")
                  }
                >
                  {b.earned ? b.icon : isNext ? b.icon : "🔒"}
                </span>
                {!isLast && <span className={"mt-1 w-0.5 flex-1 " + (b.earned ? "bg-ok/40" : "bg-slate-200")} />}
              </div>

              {/* Milestone card */}
              <div
                className={
                  "mb-1 flex-1 rounded-lg border p-3 " +
                  (b.earned ? "border-l-4 border-l-ok bg-white" : isNext ? "border-brand-200 bg-brand-50/40" : "border-slate-200 bg-white opacity-80")
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{b.name}</span>
                  <span className={`badge ${rar.className}`}>{rar.label}</span>
                  {b.earned && <span className="badge bg-green-100 text-green-700">Earned{b.earnedDate ? ` · ${b.earnedDate}` : ""}</span>}
                  {!b.earned && isNext && <span className="badge bg-brand-100 text-brand-700">Next up</span>}
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">{b.description}</p>
                <p className="mt-1 text-[11px] text-ink-muted">🎯 {b.criteria}</p>
                {b.earned && b.note && <p className="mt-1 text-[11px] italic text-ink-muted">“{b.note}”</p>}
                <p className="mt-1 text-[11px] text-ink-muted">
                  +{b.pointsBonus} 💎 diamond bonus · {b.departmentEligibility === "ALL" ? "All departments" : b.departmentEligibility} · {b.earnedCount} earned
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
