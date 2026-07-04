"use client";

import { useState, useTransition } from "react";
import { submitKpiActual, reviewKpiResult } from "@/app/(app)/kpi/actions";
import { uploadProofPhoto } from "@/lib/upload-client";
import { FileDropZone } from "@/components/FileDropZone";

export function KpiEntryRow({
  kpi,
  result,
}: {
  kpi: { id: string; name: string; targetValue: number; unit: string | null; maxPoints: number; pointMultiplier: number; evidenceRequired: boolean };
  result?: { actualValue: number; achievementPct: number; pointsAwarded: number; status: string; credited: boolean; evidenceUrl?: string | null } | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
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
      <div className="min-w-[180px] flex-1">
        <div className="text-sm font-semibold text-ink">{kpi.name}</div>
        <div className="text-xs text-ink-muted">
          Target {kpi.targetValue.toLocaleString()} {kpi.unit ?? ""} · max {kpi.maxPoints} 💎 {kpi.evidenceRequired ? "· 📎 evidence required" : ""}
          {result?.evidenceUrl && <a href={result.evidenceUrl} target="_blank" rel="noreferrer" className="ml-1 text-brand-600 hover:underline">📷 view proof</a>}
        </div>
      </div>
      <div>
        <label className="label">Actual</label>
        <input name="actualValue" type="number" step="any" defaultValue={result?.actualValue ?? ""} className="input w-28" disabled={locked} required />
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
