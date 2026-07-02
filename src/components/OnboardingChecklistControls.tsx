"use client";

import { useRef, useState, useTransition } from "react";
import { addChecklistItem, toggleChecklistItemActive, toggleStaffItem } from "@/app/(app)/onboarding/actions";

export function AddItemForm() {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={(fd) => start(async () => { await addChecklistItem(fd); ref.current?.reset(); })} className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1"><label className="label">New step</label><input name="title" className="input" placeholder="e.g. Complete HR paperwork" required /></div>
      <div className="min-w-48 flex-1"><label className="label">Description (optional)</label><input name="description" className="input" /></div>
      <button className="btn-primary px-3 py-1.5 text-sm" disabled={pending}>Add</button>
    </form>
  );
}

export function ItemActiveToggle({ itemId, active }: { itemId: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className={`btn-ghost px-2 py-0.5 text-xs ${active ? "" : "text-danger"}`} disabled={pending} onClick={() => start(() => toggleChecklistItemActive(itemId))}>
      {active ? "Disable" : "Enable"}
    </button>
  );
}

export function StaffItemCheckbox({ userId, itemId, done }: { userId: string; itemId: string; done: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer"
        checked={done}
        disabled={pending}
        onChange={() => { setErr(null); start(async () => { try { await toggleStaffItem(userId, itemId); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}
      />
      {err && <span className="ml-1 text-xs text-danger">{err}</span>}
    </span>
  );
}
