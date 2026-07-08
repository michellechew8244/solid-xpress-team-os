"use client";

import { useState, useTransition } from "react";
import { logResult, reviewResult } from "@/app/(app)/results/actions";
import { RESULT_TYPES, QUALITY_GATES } from "@/lib/result-data";

export function LogResultForm({ people, period }: { people: { id: string; name: string }[]; period: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      action={(fd) => start(async () => { setMsg(null); const r = await logResult(fd); setMsg(r.ok ? { ok: true, text: "Result logged — awaiting review ✓" } : { ok: false, text: r.error }); })}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      <input type="hidden" name="period" value={period} />
      {people.length > 0 && (
        <div>
          <label className="label">Staff</label>
          <select name="userId" className="input">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
      )}
      <div className="col-span-2">
        <label className="label">Result achieved *</label>
        <select name="resultType" className="input" required>
          {RESULT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label} (+{t.diamonds}💎 suggested)</option>)}
        </select>
      </div>
      <div><label className="label">Job no (evidence)</label><input name="relatedJobNo" className="input" placeholder="SX-2026-0045" /></div>
      <div><label className="label">Customer</label><input name="relatedCustomer" className="input" /></div>
      <div><label className="label">Evidence URL</label><input name="evidenceUrl" className="input" placeholder="link/screenshot" /></div>
      <div className="col-span-2 sm:col-span-2"><label className="label">Business impact (what did this result achieve?)</label><input name="businessImpact" className="input" placeholder="e.g. saved RM1,200 detention, customer confirmed next shipment" /></div>
      <div className="flex items-end"><button className="btn-primary w-full" disabled={pending}>{pending ? "…" : "🎯 Log result"}</button></div>
      {msg && <div className={`col-span-2 sm:col-span-3 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
    </form>
  );
}

export function ReviewResultForm({ id, suggestedDiamonds }: { id: string; suggestedDiamonds: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      action={(fd) => start(async () => { setMsg(null); const r = await reviewResult(fd); if (!r.ok) setMsg(r.error); })}
      className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2"
    >
      <input type="hidden" name="id" value={id} />
      <label className="text-[10px] text-ink-muted">Quality gate
        <select name="qualityGatePercent" className="input mt-0.5 w-64 py-1 text-xs" defaultValue={100}>
          {QUALITY_GATES.map((g) => <option key={g.pct} value={g.pct}>{g.pct}% — {g.label}</option>)}
        </select>
      </label>
      <label className="text-[10px] text-ink-muted">Result value %
        <input name="resultValue" type="number" min={0} max={120} className="input mt-0.5 w-20 py-1 text-xs" defaultValue={100} />
      </label>
      <label className="text-[10px] text-ink-muted">💎 reward
        <input name="diamonds" type="number" min={0} max={1000} className="input mt-0.5 w-20 py-1 text-xs" defaultValue={suggestedDiamonds} />
      </label>
      <button name="decision" value="approve" className="btn-primary px-3 py-1 text-xs" disabled={pending}>Approve</button>
      <button name="decision" value="reject" className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending}>Reject</button>
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </form>
  );
}
