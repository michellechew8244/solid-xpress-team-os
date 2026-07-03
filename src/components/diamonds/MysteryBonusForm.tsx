"use client";

import { useRef, useState, useTransition } from "react";
import { issueMysteryBonus } from "@/app/(app)/missions-hub/actions";

type Opt = { id: string; name: string };

export function MysteryBonusForm({ staff, departments }: { staff: Opt[]; departments: Opt[] }) {
  const [bonusType, setBonusType] = useState("RANDOM");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={(fd) => { setMsg(null); fd.set("bonusType", bonusType); start(async () => { try { const r = await issueMysteryBonus(fd); setMsg({ ok: true, text: `🎁 Mystery bonus sent to ${r.recipients} staff (+${r.amount} 💎 each).` }); ref.current?.reset(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" }); } }); }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div>
        <label className="label">Bonus type</label>
        <select className="input" value={bonusType} onChange={(e) => setBonusType(e.target.value)}>
          <option value="RANDOM">🎲 Random staff (surprise!)</option>
          <option value="INDIVIDUAL">🧍 Specific staff</option>
          <option value="DEPARTMENT">🏢 Whole department</option>
          <option value="ALL_STAFF">🌍 All staff</option>
        </select>
      </div>
      {bonusType === "INDIVIDUAL" && (
        <div><label className="label">Staff</label><select name="userId" className="input" required><option value="">— select —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      )}
      {bonusType === "DEPARTMENT" && (
        <div><label className="label">Department</label><select name="departmentId" className="input" required><option value="">— select —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      )}
      <div><label className="label">Amount (💎 each)</label><input name="amount" type="number" min={1} className="input" required /></div>
      <div className="sm:col-span-2"><label className="label">Reason *</label><input name="reason" className="input" placeholder="e.g. Boss spotted great attitude this week" required /></div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Sending…" : "🎁 Issue Mystery Bonus"}</button>
        {msg && <span className={msg.ok ? "text-xs text-ok" : "text-xs text-danger"}>{msg.text}</span>}
      </div>
    </form>
  );
}
