"use client";

import { useRef, useState, useTransition } from "react";
import { submitRequest, approveRequest, rejectRequest } from "@/app/(app)/diamonds/requests/actions";

type Opt = { id: string; name: string };

export function RequestForm({ staff, departments, allowDept }: { staff: Opt[]; departments: Opt[]; allowDept: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState<"STAFF" | "DEPT">("STAFF");
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={(fd) => { setMsg(null); start(async () => { try { await submitRequest(fd); setMsg({ ok: true, text: "Request submitted for Owner approval." }); ref.current?.reset(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" }); } }); }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2 flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" name="targetMode" checked={target === "STAFF"} onChange={() => setTarget("STAFF")} /> Individual staff</label>
        {allowDept && <label className="flex items-center gap-1"><input type="radio" name="targetMode" checked={target === "DEPT"} onChange={() => setTarget("DEPT")} /> Whole department</label>}
      </div>
      {target === "STAFF" ? (
        <div className="sm:col-span-2"><label className="label">Staff</label><select name="targetUserId" className="input"><option value="">— select —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      ) : (
        <div className="sm:col-span-2"><label className="label">Department</label><select name="departmentId" className="input"><option value="">— select —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      )}
      <div><label className="label">Requested amount *</label><input name="amount" type="number" min={1} className="input" required /></div>
      <div><label className="label">Evidence / link (optional)</label><input name="evidenceUrl" className="input" placeholder="https://…" /></div>
      <div className="sm:col-span-2"><label className="label">Reason *</label><input name="reason" className="input" required /></div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Submitting…" : "Submit proposal"}</button>
        {msg && <span className={msg.ok ? "text-xs text-ok" : "text-xs text-danger"}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function ApproveReject({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex gap-1">
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => start(async () => { try { await approveRequest(requestId); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}>Approve</button>
      <button className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending} onClick={() => { const reason = window.prompt("Reason for rejection?") ?? ""; start(async () => { try { await rejectRequest(requestId, reason); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}>Reject</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
