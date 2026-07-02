"use client";

import { useRef, useState } from "react";

/**
 * Drag-and-drop file picker that stays form-compatible: the dropped/browsed
 * file is written into a real hidden <input type="file" name=…> (via
 * DataTransfer), so existing FormData-based actions keep working unchanged.
 * Click to browse (mobile camera supported via `capture`), or drag a file in.
 */
export function FileDropZone({
  name,
  accept,
  capture,
  label,
  hint,
  disabled,
  inputRef,
}: {
  name: string;
  accept: string;
  capture?: "environment" | "user";
  label: string;
  hint?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? internalRef;
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const acceptList = accept.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  function matchesAccept(file: File): boolean {
    if (acceptList.length === 0) return true;
    const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    return acceptList.some((a) =>
      a.startsWith(".") ? a === ext : a.endsWith("/*") ? file.type.startsWith(a.slice(0, -1)) : file.type === a,
    );
  }

  function setFile(file: File | null) {
    setErr(null);
    if (!ref.current) return;
    if (!file) {
      ref.current.value = "";
      setFileName(null);
      return;
    }
    if (!matchesAccept(file)) {
      setErr(`"${file.name}" is not an accepted file type here.`);
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    ref.current.files = dt.files;
    setFileName(file.name);
  }

  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);

  return (
    <div>
      <label className="label">{label}</label>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${label} — drop a file or click to browse`}
        onClick={() => !disabled && ref.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ref.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          setFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={
          "flex min-h-[74px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-3 py-3 text-center text-xs transition-colors " +
          (disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-ink-muted opacity-60"
            : dragOver
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : fileName
                ? "border-ok bg-green-50/50 text-ink"
                : "border-slate-300 bg-slate-50 text-ink-muted hover:border-brand-400 hover:bg-brand-50/40")
        }
      >
        {fileName ? (
          <>
            <span className="font-semibold">📎 {fileName}</span>
            {ref.current?.files?.[0] && <span className="text-[10px] text-ink-muted">{mb(ref.current.files[0].size)} MB</span>}
            <button
              type="button"
              className="mt-1 text-[11px] text-danger hover:underline"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
            >
              ✕ remove
            </button>
          </>
        ) : (
          <>
            <span className="text-lg">{dragOver ? "⬇️" : "📤"}</span>
            <span className="mt-0.5 font-medium">{dragOver ? "Drop it here" : "Drag & drop, or click to browse"}</span>
            {hint && <span className="mt-0.5 text-[10px]">{hint}</span>}
          </>
        )}
      </div>
      {err && <div className="mt-1 text-xs text-danger">{err}</div>}
      <input
        ref={ref}
        type="file"
        name={name}
        accept={accept}
        capture={capture}
        disabled={disabled}
        className="hidden"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
    </div>
  );
}
