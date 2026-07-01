"use client";

import { useState, useTransition } from "react";
import { submitKpiActual, reviewKpiResult } from "@/app/(app)/kpi/actions";

export function KpiEntryRow({
  kpi,
  result,
}: {
  kpi: { id: string; name: string; targetValue: number; unit: string | null; maxPoints: number; pointMultiplier: number; evidenceRequired: boolean };
  result?: { actualValue: number; achievementPct: number; pointsAwarded: number; status: string; credited: boolean } | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const locked = result?.credited;

  return (
    <form
      action={(fd) => start(async () => { try { await submitKpiActual(fd); setMsg("Saved ✓"); } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } })}
      className="flex flex-wrap items-end gap-3 border-b border-slate-100 py-3"
    >
      <input type="hidden" name="kpiId" value={kpi.id} />
      <div className="min-w-[180px] flex-1">
        <div className="text-sm font-semibold text-ink">{kpi.name}</div>
        <div className="text-xs text-ink-muted">Target {kpi.targetValue.toLocaleString()} {kpi.unit ?? ""} · max {kpi.maxPoints} pts {kpi.evidenceRequired ? "· 📎 evidence" : ""}</div>
      </div>
      <div>
        <label className="label">Actual</label>
        <input name="actualValue" type="number" step="any" defaultValue={result?.actualValue ?? ""} className="input w-28" disabled={locked} required />
      </div>
      {kpi.evidenceRequired && (
        <div>
          <label className="label">Evidence URL</label>
          <input name="evidenceUrl" className="input w-44" placeholder="link" disabled={locked} />
        </div>
      )}
      <div className="text-center">
        <div className="text-xs text-ink-muted">Achv / Pts</div>
        <div className="text-sm font-bold text-brand-700">{result ? `${result.achievementPct}% · ${result.pointsAwarded}` : "—"}</div>
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
