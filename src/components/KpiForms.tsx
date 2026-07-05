"use client";

import { useState, useTransition } from "react";
import { submitKpiActual, reviewKpiResult } from "@/app/(app)/kpi/actions";
import { uploadProofPhoto } from "@/lib/upload-client";
import { FileDropZone } from "@/components/FileDropZone";

/** Achievement stages — staff always know where they stand and what's next. */
const KPI_STAGES = [
  { min: 0, label: "🔴 Needs a push", short: "Needs a push", color: "bg-rose-500" },
  { min: 50, label: "🟠 Below target", short: "Below target", color: "bg-orange-400" },
  { min: 70, label: "🟡 On the way", short: "On the way", color: "bg-amber-400" },
  { min: 90, label: "🔵 Almost there", short: "Almost there", color: "bg-sky-500" },
  { min: 100, label: "🟢 Target achieved!", short: "Target achieved", color: "bg-emerald-500" },
  { min: 120, label: "🏆 Outstanding (120% cap)", short: "Outstanding", color: "bg-emerald-600" },
];

/** Live progress bar with stage markers at 70 / 90 / 100%. */
export function KpiProgressBar({ actual, target, unit }: { actual: number; target: number; unit: string | null }) {
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
  const stage = [...KPI_STAGES].reverse().find((s) => pct >= s.min) ?? KPI_STAGES[0];
  const nextStage = KPI_STAGES.find((s) => s.min > pct);
  const needed = nextStage && target > 0 ? Math.max(0, Math.ceil((target * nextStage.min) / 100 - actual)) : 0;

  return (
    <div className="w-full">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all duration-300 ${stage.color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        {[70, 90].map((m) => <div key={m} className="absolute top-0 h-full w-px bg-white/80" style={{ left: `${m}%` }} />)}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 text-[11px]">
        <span className="font-semibold text-ink">{stage.label} · {pct}%</span>
        {nextStage && needed > 0 && (
          <span className="text-ink-muted">+{needed.toLocaleString()}{unit ? ` ${unit}` : ""} more → {nextStage.short}</span>
        )}
      </div>
    </div>
  );
}

export function KpiEntryRow({
  kpi,
  result,
}: {
  kpi: { id: string; name: string; targetValue: number; unit: string | null; maxPoints: number; pointMultiplier: number; evidenceRequired: boolean };
  result?: { actualValue: number; achievementPct: number; pointsAwarded: number; status: string; credited: boolean; evidenceUrl?: string | null } | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [actual, setActual] = useState<string>(result?.actualValue != null && result.actualValue !== 0 ? String(result.actualValue) : "");
  const locked = result?.credited;

  return (
    <form
      action={(fd) => start(async () => {
        try {
          // Photo proof: upload straight to cloud storage, then submit its URL
          // as the evidence link (photo wins over a hand-typed URL).
          const photo = fd.get("evidencePhoto");
          fd.delete("evidencePhoto");
          if (photo instanceof File && photo.size > 0) {
            const url = await uploadProofPhoto(photo);
            if (url) fd.set("evidenceUrl", url);
          }
          await submitKpiActual(fd);
          setMsg("Saved ✓");
        } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); }
      })}
      className="flex flex-wrap items-end gap-3 border-b border-slate-100 py-3"
    >
      <input type="hidden" name="kpiId" value={kpi.id} />
      <div className="min-w-[220px] flex-1">
        <div className="text-sm font-semibold text-ink">{kpi.name}</div>
        <div className="text-xs text-ink-muted">
          Target {kpi.targetValue.toLocaleString()} {kpi.unit ?? ""} · max {kpi.maxPoints} 💎 {kpi.evidenceRequired ? "· 📎 evidence required" : ""}
          {result?.evidenceUrl && <a href={result.evidenceUrl} target="_blank" rel="noreferrer" className="ml-1 text-brand-600 hover:underline">📷 view proof</a>}
        </div>
        {/* 📊 My progress vs target — updates live as the actual is typed */}
        <div className="mt-1.5">
          <KpiProgressBar actual={Number(actual) || 0} target={kpi.targetValue} unit={kpi.unit} />
        </div>
      </div>
      <div>
        <label className="label">Actual</label>
        <input name="actualValue" type="number" step="any" value={actual} onChange={(e) => setActual(e.target.value)} className="input w-28" disabled={locked} required />
      </div>
      <div className="w-56">
        <FileDropZone
          name="evidencePhoto"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          label="📷 Proof photo"
          hint="drag & drop your work photo"
          disabled={locked}
        />
      </div>
      {kpi.evidenceRequired && (
        <div>
          <label className="label">Evidence URL</label>
          <input name="evidenceUrl" className="input w-44" placeholder="link" disabled={locked} />
        </div>
      )}
      <div className="text-center">
        <div className="text-xs text-ink-muted">Achv / 💎</div>
        <div className="text-sm font-bold text-brand-700">{result ? `${result.achievementPct}% · ${result.pointsAwarded}` : "—"}</div>
        {result ? (
          <div className="text-[10px] text-ink-muted">{result.achievementPct}% × {kpi.pointMultiplier} = {Math.round(result.achievementPct * kpi.pointMultiplier)}{Math.round(result.achievementPct * kpi.pointMultiplier) > kpi.maxPoints ? ` → cap ${kpi.maxPoints}` : ""}</div>
        ) : (
          <div className="text-[10px] text-ink-muted">actual÷target × {kpi.pointMultiplier}, max {kpi.maxPoints}</div>
        )}
      </div>
      <div>
        {locked ? (
          <span className="badge bg-green-100 text-green-700">Approved</span>
        ) : (
          <button className="btn-primary" disabled={pending}>{result?.status === "SUBMITTED" ? "Resubmit" : "Submit"}</button>
        )}
        {msg && <div className="mt-1 text-xs text-ink-muted">{msg}</div>}
      </div>
    </form>
  );
}

export function KpiReviewButtons({ resultId }: { resultId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => start(() => reviewKpiResult(resultId, true))}>Approve & credit</button>
      <button className="btn-danger px-3 py-1 text-xs" disabled={pending} onClick={() => start(() => reviewKpiResult(resultId, false, "Please revise"))}>Reject</button>
    </div>
  );
}
