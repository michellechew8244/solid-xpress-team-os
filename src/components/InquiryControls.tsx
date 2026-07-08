"use client";

import { useState, useTransition } from "react";
import { assignInquiry, closeInquiry, startInquiry } from "@/app/(app)/inquiries/actions";
import { CLOSURE_TYPES } from "@/lib/result-data";

export function AssignInquiryForm({ people }: { people: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      action={(fd) => start(async () => { setMsg(null); const r = await assignInquiry(fd); setMsg(r.ok ? { ok: true, text: "Assigned ✓ staff notified" } : { ok: false, text: r.error }); })}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      <div><label className="label">Inquiry no. *</label><input name="inquiryNo" className="input" placeholder="INQ-0031 / email subject" required /></div>
      <div><label className="label">Customer</label><input name="customerName" className="input" /></div>
      <div>
        <label className="label">Type</label>
        <select name="inquiryType" className="input">
          {["RATE", "CUSTOMS", "STATUS", "NEW_LEAD", "DOCUMENT", "COMPLAINT", "GENERAL"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Assign to *</label>
        <select name="assignedToId" className="input" required>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div><label className="label">Due date</label><input name="dueAt" type="date" className="input" /></div>
      <div className="flex items-end"><button className="btn-primary w-full" disabled={pending}>{pending ? "…" : "📨 Assign"}</button></div>
      <div className="col-span-2 sm:col-span-3"><label className="label">Note</label><input name="note" className="input" /></div>
      {msg && <div className={`col-span-2 sm:col-span-3 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
    </form>
  );
}

export function InquiryRowActions({ id, status, mine }: { id: string; status: string; mine: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [closure, setClosure] = useState("QUOTE_SENT");
  const [msg, setMsg] = useState<string | null>(null);
  const closable = ["OPEN", "IN_PROGRESS"].includes(status);

  return (
    <div className="text-right">
      <div className="flex justify-end gap-1">
        {status === "OPEN" && mine && (
          <button className="btn-ghost px-2 py-0.5 text-[11px]" disabled={pending} onClick={() => start(async () => { await startInquiry(id); })}>▶ Start</button>
        )}
        {closable && <button className="btn-primary px-2 py-0.5 text-[11px]" onClick={() => setOpen((o) => !o)}>✓ Close</button>}
      </div>
      {open && closable && (
        <form
          action={(fd) => start(async () => { setMsg(null); const r = await closeInquiry(fd); if (!r.ok) setMsg(r.error); else setOpen(false); })}
          className="mt-1 grid gap-1 rounded-lg bg-slate-50 p-2 text-left"
        >
          <input type="hidden" name="id" value={id} />
          <select name="closureType" className="input py-1 text-xs" value={closure} onChange={(e) => setClosure(e.target.value)}>
            {CLOSURE_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {closure === "NO_RESPONSE_LOST" && <input name="lostReason" className="input py-1 text-xs" placeholder="Lost reason (required)" />}
          {closure === "AWAITING_AGENT_RATE" && <input name="followUpProofUrl" className="input py-1 text-xs" placeholder="RFQ / follow-up proof link (required)" />}
          <input name="note" className="input py-1 text-xs" placeholder="Note (optional)" />
          <button className="btn-primary px-2 py-1 text-xs" disabled={pending}>{pending ? "…" : "Close inquiry"}</button>
          {msg && <div className="text-[10px] text-danger">{msg}</div>}
        </form>
      )}
    </div>
  );
}
