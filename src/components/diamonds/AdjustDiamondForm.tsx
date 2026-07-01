"use client";

import { useRef, useState, useTransition } from "react";
import { adjustBalance } from "@/app/(app)/owner/diamonds/actions";

export function AdjustDiamondForm({ staff }: { staff: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={(fd) => { setMsg(null); start(async () => { try { await adjustBalance(fd); setMsg({ ok: true, text: "Balance adjusted." }); ref.current?.reset(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" }); } }); }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label className="label">Staff</label>
        <select name="userId" className="input" required><option value="">— select —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      <div>
        <label className="label">Adjustment type</label>
        <select name="adjustmentType" className="input"><option value="ADD">Add diamonds</option><option value="DEDUCT">Deduct diamonds</option></select>
      </div>
      <div><label className="label">Amount</label><input name="amount" type="number" min={1} className="input" required /></div>
      <div className="sm:col-span-2"><label className="label">Reason *</label><input name="reason" className="input" required /></div>
      <div><label className="label">Related transaction ID (optional)</label><input name="relatedTransactionId" className="input" /></div>
      <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ownerOverride" /> Owner override (allow negative)</label></div>
      <div className="sm:col-span-2"><label className="label">Internal note</label><input name="internalNote" className="input" /></div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Apply adjustment"}</button>
        {msg && <span className={msg.ok ? "text-xs text-ok" : "text-xs text-danger"}>{msg.text}</span>}
      </div>
    </form>
  );
}
