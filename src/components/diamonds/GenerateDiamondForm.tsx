"use client";

import { useRef, useState, useTransition } from "react";
import { generateDiamonds, type GenerateResult } from "@/app/(app)/owner/diamonds/actions";

type Opt = { id: string; name: string };

export function GenerateDiamondForm({
  staff, departments, sourceTypes,
}: {
  staff: Opt[]; departments: Opt[]; sourceTypes: Record<string, string>;
}) {
  const [recipientType, setRecipientType] = useState("INDIVIDUAL");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<FormData | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  function review(fd: FormData) {
    setErr(null); setResult(null);
    const amount = Number(fd.get("amount") ?? 0);
    if (!amount || amount <= 0) { setErr("Diamond amount must be positive."); return; }
    if (!String(fd.get("reason") ?? "").trim()) { setErr("Reason is required."); return; }
    fd.set("selectedIds", selected.join(","));
    const who = recipientType === "INDIVIDUAL" ? (staff.find((s) => s.id === fd.get("staffId"))?.name ?? "this staff")
      : recipientType === "DEPARTMENT" ? `${departments.find((d) => d.id === fd.get("departmentId"))?.name ?? "the department"} (whole department)`
      : recipientType === "ALL" ? "ALL staff"
      : `${selected.length} selected staff`;
    setConfirmText(`You are about to generate ${amount} diamonds for ${who}. This action will be permanently recorded. Continue?`);
    setConfirm(fd);
  }

  function submit() {
    if (!confirm) return;
    start(async () => {
      try { const r = await generateDiamonds(confirm); setResult(r); setConfirm(null); ref.current?.reset(); setSelected([]); setRecipientType("INDIVIDUAL"); }
      catch (e) { setErr(e instanceof Error ? e.message : "Error"); setConfirm(null); }
    });
  }

  return (
    <div>
      {result && (
        <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <div className="font-semibold">✅ Diamonds generated successfully.</div>
          <div className="text-green-700">{result.amount} 💎 × {result.count} → {result.recipient}</div>
        </div>
      )}

      <form ref={ref} action={review} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Recipient type</label>
          <select name="recipientType" className="input" value={recipientType} onChange={(e) => setRecipientType(e.target.value)}>
            <option value="INDIVIDUAL">Individual Staff</option>
            <option value="DEPARTMENT">Department</option>
            <option value="ALL">All Staff</option>
            <option value="SELECTED">Selected Staff Group</option>
          </select>
        </div>

        {recipientType === "INDIVIDUAL" && (
          <div className="sm:col-span-2">
            <label className="label">Staff</label>
            <select name="staffId" className="input" required><option value="">— select —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </div>
        )}
        {recipientType === "DEPARTMENT" && (
          <div className="sm:col-span-2">
            <label className="label">Department</label>
            <select name="departmentId" className="input" required><option value="">— select —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </div>
        )}
        {recipientType === "SELECTED" && (
          <div className="sm:col-span-2">
            <label className="label">Selected staff ({selected.length})</label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => setSelected((cur) => e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id))} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div><label className="label">Diamond amount *</label><input name="amount" type="number" min={1} className="input" required /></div>
        <div>
          <label className="label">Source type</label>
          <select name="sourceType" className="input">{Object.entries(sourceTypes).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        <div className="sm:col-span-2"><label className="label">Reason *</label><input name="reason" className="input" required placeholder="e.g. Q3 outstanding customer service" /></div>
        <div><label className="label">Effective date</label><input name="effectiveDate" type="date" className="input" /></div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyStaff" defaultChecked /> Notify staff</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ownerOverride" /> Owner override</label>
        </div>
        <div className="sm:col-span-2"><label className="label">Internal note (Owner/HR only)</label><input name="internalNote" className="input" /></div>

        {err && <div className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <div className="sm:col-span-2"><button className="btn-primary" type="submit">💎 Generate Diamonds</button></div>
      </form>

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold text-ink">Confirm generation</div>
            <p className="mt-2 text-sm text-ink-muted">{confirmText}</p>
            <div className="mt-5 flex gap-2">
              <button className="btn-primary flex-1" disabled={pending} onClick={submit}>{pending ? "Generating…" : "Confirm & Generate"}</button>
              <button className="btn-ghost" disabled={pending} onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
