"use client";

import { useRef, useState, useTransition } from "react";
import { createWorkReport, updateWorkProgress, deleteWorkReport } from "@/app/(app)/work-reports/actions";
import { stageUploads } from "@/lib/upload-client";
import { FileDropZone } from "@/components/FileDropZone";

const TYPES: Record<string, string> = {
  JOB_REPORT: "📦 Job report",
  STATUS_REPORT: "📋 Status report",
  PROGRESS_UPDATE: "📈 Progress update",
  OTHER: "🗂️ Other",
};

const DOC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

export function UploadWorkReportForm({ jobs }: { jobs: { id: string; jobNumber: string }[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={(fd) => start(async () => {
        setErr(null); setOk(false);
        try {
          // Uploads straight to cloud storage, then registers the report.
          await stageUploads(fd, [{ field: "file", category: "document" }]);
          await createWorkReport(fd);
          ref.current?.reset(); setOk(true);
        } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
      })}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <FileDropZone
          name="file"
          accept={DOC_ACCEPT}
          label="📤 Drag & drop your report file"
          hint="Excel / Word / PDF / CSV · max 25MB"
        />
      </div>
      <div><label className="label">Report title *</label><input name="title" className="input" placeholder="e.g. Weekly shipment status – W27" required /></div>
      <div>
        <label className="label">Type</label>
        <select name="reportType" className="input">{Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div>
        <label className="label">Linked job (optional)</label>
        <select name="jobId" className="input"><option value="">— none —</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.jobNumber}</option>)}</select>
      </div>
      <div><label className="label">Current progress (%)</label><input name="progressPct" type="number" min={0} max={100} defaultValue={0} className="input" /></div>
      <div className="sm:col-span-2"><label className="label">Note (optional)</label><input name="progressNote" className="input" placeholder="Anything the manager should know" /></div>
      {err && <div className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {ok && <div className="sm:col-span-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✅ Report uploaded — the system has recorded it and notified your manager.</div>}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={pending}>{pending ? "Uploading…" : "📤 Upload report"}</button></div>
    </form>
  );
}

export function ProgressUpdater({ reportId, current }: { reportId: string; current: number }) {
  const [pct, setPct] = useState(current);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(true)}>✏️ Update progress</button>;
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
      <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-36" />
      <span className="w-10 text-sm font-bold text-brand-700">{pct}%</span>
      <input className="input w-44 py-1 text-xs" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => { setErr(null); start(async () => { try { await updateWorkProgress(reportId, pct, note); setOpen(false); setNote(""); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}>
        {pending ? "Saving…" : "Save"}
      </button>
      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}

export function DeleteReportButton({ reportId }: { reportId: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-xs text-danger hover:underline" disabled={pending} onClick={() => { if (window.confirm("Delete this report and its file?")) start(() => deleteWorkReport(reportId)); }}>
      delete
    </button>
  );
}
