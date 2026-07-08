"use client";

import { useState, useTransition } from "react";
import { saveFameEntry, deleteFameEntry } from "@/app/(app)/achievement-wall/actions";
import { uploadProofPhoto } from "@/lib/upload-client";
import { FileDropZone } from "@/components/FileDropZone";

export interface FameEntry {
  id: string; category: string; title: string; honoree: string | null; userId: string | null;
  periodLabel: string | null; description: string | null; imageUrl: string | null; order: number; isActive: boolean;
}

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: "GENIUS_RECORD", label: "🧠 Genius Record", icon: "🧠" },
  { key: "MONTHLY_CHAMPION", label: "🏆 Monthly Champion", icon: "🏆" },
  { key: "YEARLY_CHAMPION", label: "👑 Yearly Champion", icon: "👑" },
  { key: "SWEET_MEMORY", label: "💛 Sweet Memory", icon: "💛" },
  { key: "CUSTOM", label: "✨ Custom", icon: "✨" },
];
export const CATEGORY_META = (k: string) => CATEGORIES.find((c) => c.key === k) ?? CATEGORIES[4];

function EntryForm({ entry, people, onDone, onCancel }: {
  entry: Partial<FameEntry>;
  people: { id: string; name: string }[];
  onDone: () => void; onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(entry.imageUrl ?? null);
  const editing = !!entry.id;

  return (
    <form
      action={(fd) => start(async () => {
        setMsg(null);
        try {
          const photo = fd.get("photo");
          fd.delete("photo");
          if (photo instanceof File && photo.size > 0) {
            const url = await uploadProofPhoto(photo);
            if (url) fd.set("imageUrl", url);
          }
          const res = await saveFameEntry(fd);
          if (res.ok) onDone(); else setMsg(res.error);
        } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); }
      })}
      className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
    >
      {editing && <input type="hidden" name="id" value={entry.id} />}
      {preview && <input type="hidden" name="imageUrl" value={preview} />}
      <div>
        <label className="label">Category</label>
        <select name="category" className="input" defaultValue={entry.category ?? "MONTHLY_CHAMPION"}>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Period (optional)</label>
        <input name="periodLabel" className="input" defaultValue={entry.periodLabel ?? ""} placeholder="e.g. July 2026 / 2026" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Title *</label>
        <input name="title" className="input" defaultValue={entry.title ?? ""} placeholder="e.g. Fastest customs clearance record" required />
      </div>
      <div>
        <label className="label">Honoree name(s)</label>
        <input name="honoree" className="input" defaultValue={entry.honoree ?? ""} placeholder="e.g. Tan Jia Pei" />
      </div>
      <div>
        <label className="label">Link staff (optional)</label>
        <select name="userId" className="input" defaultValue={entry.userId ?? ""}>
          <option value="">— none —</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description / story</label>
        <textarea name="description" className="input min-h-16" defaultValue={entry.description ?? ""} placeholder="What did they achieve? Make it memorable." />
      </div>
      <div className="sm:col-span-2">
        <FileDropZone name="photo" accept="image/png,image/jpeg,image/webp" label="📷 Photo (optional)" hint="drag & drop or choose — large photos compress" />
        {preview && (
          <div className="mt-1 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="h-12 w-12 rounded-lg object-cover" />
            <button type="button" className="text-xs text-danger hover:underline" onClick={() => setPreview(null)}>remove photo</button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={entry.isActive ?? true} /> Show on wall</label>
        <div><label className="label text-[10px]">Order</label><input name="order" type="number" className="input w-16 py-1 text-xs" defaultValue={entry.order ?? 0} /></div>
      </div>
      <div className="flex items-end justify-end gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : editing ? "Save" : "Add to wall"}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
      {msg && <div className="sm:col-span-2 text-xs text-danger">{msg}</div>}
    </form>
  );
}

/** Manager toolbar: add a new honour + edit/delete controls surface via cards. */
export function WallOfFameAdmin({ entries, people }: { entries: FameEntry[]; people: { id: string; name: string }[] }) {
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const editing = editId && editId !== "new" ? entries.find((e) => e.id === editId) : null;

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => { setEditId("new"); setMsg(null); }}>＋ Add to Wall of Fame</button>
        {entries.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs">
            {CATEGORY_META(e.category).icon} {e.title}
            <button className="text-brand-600 hover:underline" onClick={() => { setEditId(e.id); setMsg(null); }}>edit</button>
            <button className="text-danger hover:underline" disabled={pending}
              onClick={() => { if (confirm(`Remove "${e.title}" from the wall?`)) start(async () => { const r = await deleteFameEntry(e.id); if (!r.ok) setMsg(r.error); }); }}>×</button>
          </span>
        ))}
      </div>
      {msg && <div className="mt-1 text-xs text-danger">{msg}</div>}
      {editId && (
        <div className="mt-3">
          <EntryForm
            entry={editing ?? { category: "MONTHLY_CHAMPION", isActive: true, order: 0 }}
            people={people}
            onDone={() => setEditId(null)}
            onCancel={() => setEditId(null)}
          />
        </div>
      )}
    </div>
  );
}
