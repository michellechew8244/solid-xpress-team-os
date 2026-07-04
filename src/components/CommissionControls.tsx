"use client";

import { useState, useTransition } from "react";
import { recomputeCommission, financeConfirmCommission, approveCommission, holdCommission, releaseCommission } from "@/app/(app)/commission/actions";

export function ComputeCommissionForm({ people, period }: { people: { id: string; name: string }[]; period: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      action={(fd) => start(async () => { setMsg(null); const r = await recomputeCommission(fd); setMsg(r.ok ? { ok: true, text: "Computed ✓" } : { ok: false, text: r.error }); })}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="period" value={period} />
      <div>
        <label className="label">Salesperson</label>
        <select name="userId" className="input w-48">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div><label className="label">GP target (RM)</label><input name="gpTarget" type="number" step="0.01" className="input w-36" required /></div>
      <button className="btn-primary" disabled={pending}>{pending ? "…" : "Compute from collected GP"}</button>
      {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
    </form>
  );
}

export function CommissionRowActions({ id, status, canFinance, canBoss, needsBossFor150, achievement }: {
  id: string; status: string; canFinance: boolean; canBoss: boolean; needsBossFor150: boolean; achievement: number;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setMsg(null);
    const r = await fn();
    if (!r.ok && r.error) setMsg(r.error);
  });

  return (
    <div className="text-right">
      <div className="flex justify-end gap-1">
        {status === "PENDING" && canFinance && (
          <button className="btn-ghost px-2 py-0.5 text-[11px]" disabled={pending} onClick={() => run(() => financeConfirmCommission(id))}>✓ Finance confirm</button>
        )}
        {status === "FINANCE_CONFIRMED" && canBoss && (
          <button className="btn-primary px-2 py-0.5 text-[11px]" disabled={pending} onClick={() => run(() => approveCommission(id))}>
            Approve{needsBossFor150 && achievement >= 150 ? " (150%+)" : ""}
          </button>
        )}
        {status === "HELD" && (canFinance || canBoss) && (
          <button className="btn-ghost px-2 py-0.5 text-[11px] text-ok" disabled={pending} onClick={() => run(() => releaseCommission(id))}>Release</button>
        )}
        {status !== "HELD" && status !== "PAID" && (canFinance || canBoss) && (
          <button className="btn-ghost px-2 py-0.5 text-[11px] text-danger" onClick={() => setHolding((h) => !h)}>Hold</button>
        )}
      </div>
      {holding && (
        <form action={(fd) => run(() => holdCommission(fd))} className="mt-1 flex justify-end gap-1">
          <input type="hidden" name="id" value={id} />
          <input name="reason" className="input w-52 py-0.5 text-xs" placeholder="Hold reason (e.g. payment not collected)" required />
          <button className="btn-danger px-2 py-0.5 text-[11px]" disabled={pending}>Hold</button>
        </form>
      )}
      {msg && <div className="mt-0.5 text-[10px] text-danger">{msg}</div>}
    </div>
  );
}
