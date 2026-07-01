"use client";

import { useRef, useState } from "react";
import { createDepartment, updateDepartment } from "@/app/(app)/departments/actions";

export function NewDepartmentForm() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>＋ New Department</button>
      {open && (
        <form ref={ref} action={async (fd) => { await createDepartment(fd); ref.current?.reset(); setOpen(false); }} className="card mt-3 grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Department name</label><input name="name" className="input" required /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><input name="description" className="input" /></div>
          <div><label className="label">Monthly revenue target (RM)</label><input name="revenueTarget" type="number" className="input" defaultValue={0} /></div>
          <div><label className="label">Monthly GP target (RM)</label><input name="grossProfitTarget" type="number" className="input" defaultValue={0} /></div>
          <div className="flex items-end gap-2"><button className="btn-primary">Create</button><button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function EditDepartmentForm({
  dept,
  people,
}: {
  dept: { id: string; description: string | null; headId: string | null; revenueTarget: number; grossProfitTarget: number };
  people: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen((o) => !o)}>Edit</button>
      {open && (
        <form action={async (fd) => { await updateDepartment(fd); setOpen(false); }} className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={dept.id} />
          <div>
            <label className="label">Department head</label>
            <select name="headId" className="input" defaultValue={dept.headId ?? ""}>
              <option value="">— none —</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="label">Description</label><input name="description" className="input" defaultValue={dept.description ?? ""} /></div>
          <div><label className="label">Revenue target (RM)</label><input name="revenueTarget" type="number" className="input" defaultValue={dept.revenueTarget} /></div>
          <div><label className="label">GP target (RM)</label><input name="grossProfitTarget" type="number" className="input" defaultValue={dept.grossProfitTarget} /></div>
          <div className="flex items-end gap-2 sm:col-span-2"><button className="btn-primary px-3 py-1.5 text-xs">Save</button><button className="btn-ghost px-3 py-1.5 text-xs" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}
