"use client";

import { useRef, useState, useTransition } from "react";
import { createKpi, toggleKpi } from "@/app/(app)/kpi-setup/actions";

const FREQ = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"];

export function NewKpiForm({ departments, lockedDept }: { departments: { id: string; name: string }[]; lockedDept?: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>＋ New KPI</button>
      {open && (
        <form ref={ref} action={async (fd) => { await createKpi(fd); ref.current?.reset(); setOpen(false); }} className="card mt-3 grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">KPI name</label><input name="name" className="input" required /></div>
          {lockedDept ? (
            <input type="hidden" name="departmentId" value={lockedDept} />
          ) : (
            <div>
              <label className="label">Department</label>
              <select name="departmentId" className="input" required><option value="">— select —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </div>
          )}
          <div><label className="label">Category</label><input name="category" className="input" placeholder="e.g. Accuracy" /></div>
          <div><label className="label">Target value</label><input name="targetValue" type="number" step="any" className="input" defaultValue={100} /></div>
          <div><label className="label">Unit</label><input name="unit" className="input" placeholder="%, RM, count" /></div>
          <div>
            <label className="label">Frequency</label>
            <select name="frequency" className="input" defaultValue="MONTHLY">{FREQ.map((f) => <option key={f} value={f}>{f}</option>)}</select>
          </div>
          <div><label className="label">Weightage</label><input name="weightage" type="number" step="any" className="input" defaultValue={1} /></div>
          <div><label className="label">Point multiplier</label><input name="pointMultiplier" type="number" step="any" className="input" defaultValue={1} /></div>
          <div><label className="label">Max points (cap)</label><input name="maxPoints" type="number" className="input" defaultValue={250} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="evidenceRequired" className="h-4 w-4" /> Evidence required</label>
          <div className="sm:col-span-2"><label className="label">Description</label><input name="description" className="input" /></div>
          <div className="flex items-end gap-2 sm:col-span-2"><button className="btn-primary">Create KPI</button><button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function KpiToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      className={`badge ${active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}
      disabled={pending}
      onClick={() => start(() => toggleKpi(id, !active))}
    >
      {active ? "Active" : "Inactive"}
    </button>
  );
}
