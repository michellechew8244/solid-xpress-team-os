"use client";

import { useRef, useState } from "react";
import { TASK_TYPES, TASK_PRIORITY, DIFFICULTY_OPTIONS } from "@/lib/enums";
import { createTask } from "@/app/(app)/missions/actions";

export function NewTaskForm({ people, selfOnly = false }: { people: { id: string; name: string }[]; selfOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>＋ New Mission</button>
      {open && (
        <form
          ref={formRef}
          action={async (fd) => {
            await createTask(fd);
            formRef.current?.reset();
            setOpen(false);
          }}
          className="card mt-3 grid gap-3 p-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label className="label">Title</label>
            <input name="title" className="input" required placeholder="e.g. Follow up quotation with customer" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea name="description" className="input" rows={2} />
          </div>
          {!selfOnly && (
            <div>
              <label className="label">Assign to</label>
              <select name="assigneeId" className="input">
                <option value="">— Unassigned —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Type</label>
            <select name="type" className="input">
              {TASK_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select name="priority" className="input" defaultValue="MEDIUM">
              {TASK_PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Difficulty (point multiplier)</label>
            <select name="difficulty" className="input" defaultValue="NORMAL">
              {DIFFICULTY_OPTIONS.map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Deadline</label>
            <input name="deadline" type="date" className="input" />
          </div>
          <div>
            <label className="label">Points value</label>
            <input name="pointsValue" type="number" className="input" defaultValue={10} min={0} />
          </div>
          <div className="flex items-end gap-2">
            <button className="btn-primary" type="submit">Create</button>
            <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
