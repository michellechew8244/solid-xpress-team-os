"use client";

import { useState, useTransition } from "react";
import { computeBonusPool, approveBonusPool, overrideExclusion } from "@/app/(app)/bonus-pool/actions";

export function PoolActions({ period, poolPct, status }: { period: string; poolPct: number; status: string | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <form action={(fd) => start(async () => { setMsg(null); const r = await computeBonusPool(fd); setMsg(r.ok ? { ok: true, text: "Pool computed ✓" } : { ok: false, text: r.error }); })} className="flex items-end gap-2">
        <input type="hidden" name="period" value={period} />
        <div><label className="label">Pool % of collected GP</label><input name="poolPct" type="number" step="0.1" min="0" max="10" className="input w-28" defaultValue={poolPct} /></div>
        <button className="btn-primary" disabled={pending || status === "APPROVED"}>{pending ? "Computing…" : status ? "Recompute pool" : "Compute pool"}</button>
      </form>
      {status === "DRAFT" && (
        <button
          className="btn-primary bg-emerald-600 hover:bg-emerald-700"
          disabled={pending}
          onClick={() => start(async () => { setMsg(null); const r = await approveBonusPool(period); setMsg(r.ok ? { ok: true, text: "Approved ✓ staff notified" } : { ok: false, text: r.error }); })}
        >✅ Approve pool</button>
      )}
      {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
    </div>
  );
}

export function OverrideExclusionButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) return <button className="btn-ghost px-2 py-0.5 text-[10px]" onClick={() => setOpen(true)}>Override</button>;
  return (
    <form action={(fd) => start(async () => { setMsg(null); const r = await overrideExclusion(fd); if (!r.ok) setMsg(r.error); else setOpen(false); })} className="flex gap-1">
      <input type="hidden" name="id" value={id} />
      <input name="reason" className="input w-40 py-0.5 text-[10px]" placeholder="Override reason" required />
      <button className="btn-primary px-2 py-0.5 text-[10px]" disabled={pending}>OK</button>
      {msg && <span className="text-[10px] text-danger">{msg}</span>}
    </form>
  );
}
