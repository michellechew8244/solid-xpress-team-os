"use client";

import { useRef, useState, useTransition } from "react";
import { createAnnouncement, togglePin, deleteAnnouncement, markAnnouncementRead } from "@/app/(app)/announcements/actions";

export function NewAnnouncementForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>＋ New Announcement</button>
      {open && (
        <form
          ref={ref}
          action={(fd) => { setErr(null); start(async () => { try { await createAnnouncement(fd); ref.current?.reset(); setOpen(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}
          className="card mt-3 grid gap-3 p-4"
        >
          <div><label className="label">Title *</label><input name="title" className="input" required /></div>
          <div><label className="label">Message *</label><textarea name="body" className="input min-h-24" required /></div>
          <div className="flex flex-wrap items-end gap-4">
            <div><label className="label">Audience</label>
              <select name="audience" className="input w-56"><option value="ALL">🏢 Whole company</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name} only</option>)}</select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="pinned" /> 📌 Pin to top</label>
          </div>
          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="flex gap-2"><button className="btn-primary" disabled={pending}>{pending ? "Posting…" : "Post"}</button><button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function AnnouncementRowActions({ id, pinned, canDelete }: { id: string; pinned: boolean; canDelete: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex gap-1">
      <button className="btn-ghost px-2 py-0.5 text-xs" disabled={pending} onClick={() => start(() => togglePin(id))}>{pinned ? "Unpin" : "📌 Pin"}</button>
      {canDelete && <button className="btn-ghost px-2 py-0.5 text-xs text-danger" disabled={pending} onClick={() => { if (window.confirm("Delete this announcement?")) start(() => deleteAnnouncement(id)); }}>Delete</button>}
    </span>
  );
}

export function MarkReadButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button className="btn-ghost px-3 py-1 text-xs" disabled={pending} onClick={() => start(() => markAnnouncementRead(id))}>✓ Mark as read</button>;
}
