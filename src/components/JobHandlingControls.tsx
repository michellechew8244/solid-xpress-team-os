"use client";

import { useState, useTransition } from "react";
import { logJobHandling, updateJobHandling, deleteJobHandling } from "@/app/(app)/jobs/handling-records/actions";
import { JOB_TYPES, label } from "@/lib/job-types";

type Person = { id: string; name: string };

export function LogJobForm({ people, defaultMonth }: { people: Person[]; defaultMonth: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [group, setGroup] = useState<string>("CS");

  return (
    <form
      action={(fd) => start(async () => {
        setMsg(null);
        const res = await logJobHandling(fd);
        setMsg(res.ok ? { ok: true, text: "Job logged ✓" } : { ok: false, text: res.error });
      })}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {people.length > 0 && (
        <div>
          <label className="label">Staff</label>
          <select name="userId" className="input">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
      )}
      <div><label className="label">Job No *</label><input name="jobNo" className="input" placeholder="SX-2026-0001" required /></div>
      <div><label className="label">Customer</label><input name="customerName" className="input" /></div>
      <div>
        <label className="label">Role</label>
        <select name="handledRole" className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
          {Object.keys(JOB_TYPES).map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Job type *</label>
        <select name="jobType" className="input" required>
          {(JOB_TYPES[group] ?? []).map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Service</label>
        <select name="serviceType" className="input">
          {["SEA", "AIR", "LAND", "TRANSLOADING", "HAULAGE", "WAREHOUSE", "OTHER"].map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
      </div>
      <div><label className="label">Month</label><input name="jobMonth" type="month" className="input" defaultValue={defaultMonth} /></div>
      <div>
        <label className="label">Status</label>
        <select name="status" className="input" defaultValue="IN_PROGRESS">
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="OPEN">Open</option>
        </select>
      </div>
      <div className="col-span-2 sm:col-span-3"><label className="label">Note</label><input name="note" className="input" /></div>
      <div className="flex items-end"><button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "＋ Log job"}</button></div>
      {msg && <div className={`col-span-2 sm:col-span-4 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
    </form>
  );
}

export function JobRowControls({ id, status, isValid, quality, errors, manager }: { id: string; status: string; isValid: boolean; quality: number; errors: number; manager: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const submit = (fd: FormData) => start(async () => {
    setMsg(null);
    const res = await updateJobHandling(fd);
    if (!res.ok) setMsg(res.error); else setOpen(false);
  });

  return (
    <div className="text-right">
      <div className="flex justify-end gap-1">
        {status !== "COMPLETED" && (
          <form action={submit}>
            <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="COMPLETED" />
            <button className="btn-ghost px-2 py-0.5 text-[11px]" disabled={pending}>✓ Complete</button>
          </form>
        )}
        {manager && <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setOpen((o) => !o)}>⚖️ Validate</button>}
        <button
          className="btn-ghost px-2 py-0.5 text-[11px] text-danger"
          disabled={pending}
          onClick={() => start(async () => { if (confirm("Delete this job record?")) { const r = await deleteJobHandling(id); if (!r.ok) setMsg(r.error); } })}
        >🗑️</button>
      </div>
      {open && manager && (
        <form action={submit} className="mt-1 flex flex-wrap items-end justify-end gap-1 rounded-lg bg-slate-50 p-2 text-left">
          <input type="hidden" name="id" value={id} />
          <label className="text-[10px] text-ink-muted">Status
            <select name="status" className="input mt-0.5 w-32 py-0.5 text-xs" defaultValue={status}>
              {["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXCLUDED_FROM_KPI"].map((x) => <option key={x} value={x}>{x.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <label className="text-[10px] text-ink-muted">Counts for KPI
            <select name="isValidForKPI" className="input mt-0.5 w-20 py-0.5 text-xs" defaultValue={String(isValid)}>
              <option value="true">Yes</option><option value="false">No</option>
            </select>
          </label>
          <label className="text-[10px] text-ink-muted">Quality
            <input name="qualityScore" type="number" className="input mt-0.5 w-16 py-0.5 text-xs" defaultValue={quality} />
          </label>
          <label className="text-[10px] text-ink-muted">Errors
            <input name="errorCount" type="number" className="input mt-0.5 w-14 py-0.5 text-xs" defaultValue={errors} />
          </label>
          <button className="btn-primary px-2 py-1 text-xs" disabled={pending}>Save</button>
        </form>
      )}
      {msg && <div className="mt-0.5 text-[10px] text-danger">{msg}</div>}
    </div>
  );
}
