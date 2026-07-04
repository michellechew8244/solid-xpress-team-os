"use client";

import { useRef, useState } from "react";

/**
 * Multi-file / folder drop zone. Lets a manager drop many slide/document files
 * — or an entire folder — at once. Dropped folders are read recursively via the
 * File System Entries API; a "Browse folder" button uses `webkitdirectory`.
 * Files are held in React state and handed back through `onChange`; the parent
 * form stages them to cloud storage on submit.
 */
export function MultiFileDropZone({
  files,
  onChange,
  label,
  hint,
  disabled,
  maxMb = 300,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  maxMb?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  function addFiles(incoming: File[]) {
    // Drop hidden/system + empty files silently (common in dropped folders).
    const cleaned = incoming.filter(
      (f) => f.size > 0 && !f.name.startsWith(".") && f.name !== "Thumbs.db" && f.name !== "desktop.ini",
    );
    const tooBig = cleaned.filter((f) => f.size > maxMb * 1024 * 1024);
    const ok = cleaned.filter((f) => f.size <= maxMb * 1024 * 1024);

    const merged = [...files];
    for (const f of ok) {
      if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
    }
    onChange(merged);

    const skipped = incoming.length - cleaned.length;
    const msgs: string[] = [];
    if (tooBig.length) msgs.push(`${tooBig.length} file(s) skipped (over ${maxMb}MB)`);
    if (skipped) msgs.push(`${skipped} hidden/empty file(s) skipped`);
    setNote(msgs.join(" · ") || null);
  }

  // Recursively read a dropped file/folder entry into a flat File[].
  async function readEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
    if (entry.isFile) {
      await new Promise<void>((res) =>
        (entry as FileSystemFileEntry).file((f) => { out.push(f); res(); }, () => res()),
      );
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns results in batches; keep reading until empty.
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries((e) => res(e), () => res([])));
        for (const e of batch) await readEntry(e, out);
      } while (batch.length > 0);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const items = e.dataTransfer.items;
    const entries = items
      ? Array.from(items).map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
      : [];
    if (entries.some(Boolean)) {
      const out: File[] = [];
      for (const ent of entries) if (ent) await readEntry(ent, out);
      addFiles(out);
    } else {
      addFiles(Array.from(e.dataTransfer.files ?? []));
    }
  }

  function removeAt(i: number) {
    onChange(files.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <label className="label">{label}</label>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${label} — drop files or a folder, or click to browse`}
        onClick={() => !disabled && fileRef.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={
          "flex min-h-[84px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-3 py-3 text-center text-xs transition-colors " +
          (disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-ink-muted opacity-60"
            : dragOver
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : files.length
                ? "border-ok bg-green-50/50 text-ink"
                : "border-slate-300 bg-slate-50 text-ink-muted hover:border-brand-400 hover:bg-brand-50/40")
        }
      >
        <span className="text-lg">{dragOver ? "⬇️" : "📂"}</span>
        <span className="mt-0.5 font-medium">{dragOver ? "Drop files or the folder here" : "Drag & drop files or a whole folder"}</span>
        <div className="mt-1 flex gap-2">
          <button type="button" className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-50" disabled={disabled}
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>📄 Browse files</button>
          <button type="button" className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-50" disabled={disabled}
            onClick={(e) => { e.stopPropagation(); folderRef.current?.click(); }}>📁 Browse folder</button>
        </div>
        {hint && <span className="mt-1 text-[10px]">{hint}</span>}
      </div>

      {note && <div className="mt-1 text-[11px] text-amber-600">{note}</div>}

      {files.length > 0 && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-ink-muted">
            <span>{files.length} file(s) · {mb(totalBytes)} MB total</span>
            <button type="button" className="text-danger hover:underline" disabled={disabled} onClick={() => onChange([])}>clear all</button>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-[11px]">
                <span className="truncate">📎 {f.name} <span className="text-ink-muted">({mb(f.size)} MB)</span></span>
                <button type="button" className="shrink-0 text-danger hover:underline" disabled={disabled} onClick={() => removeAt(i)}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <input ref={fileRef} type="file" multiple className="hidden" disabled={disabled}
        onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      {/* Folder picker — webkitdirectory isn't a typed React prop, so set via spread. */}
      <input ref={folderRef} type="file" multiple className="hidden" disabled={disabled}
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    </div>
  );
}
