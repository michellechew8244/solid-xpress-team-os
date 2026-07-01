"use client";

import { useRef, useState, useTransition } from "react";
import { createCoaching, acknowledgeCoaching } from "@/app/(app)/coaching/actions";

export function NewCoachingForm({ staff }: { staff: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>＋ New Coaching Record</button>
      {open && (
        <form ref={ref} action={async (fd) => { await createCoaching(fd); ref.current?.reset(); setOpen(false); }} className="card mt-3 grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <label className="label">Staff</label>
            <select name="staffId" className="input" required>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <select name="category" className="input">
              <option value="KPI_MISSED">KPI missed</option>
              <option value="TASK_MISSED">Task missed</option>
              <option value="BEHAVIOUR">Behaviour</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Issue</label>
            <input name="issue" className="input" required />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Coaching note</label>
            <textarea name="coachingNote" className="input" rows={2} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Improvement action</label>
            <textarea name="improvementAction" className="input" rows={2} />
          </div>
          <div>
            <label className="label">Follow-up deadline</label>
            <input name="deadline" type="date" className="input" />
          </div>
          <div className="flex items-end gap-2">
            <button className="btn-primary" type="submit">Save</button>
            <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AcknowledgeButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => start(() => acknowledgeCoaching(id))}>Acknowledge</button>;
}
