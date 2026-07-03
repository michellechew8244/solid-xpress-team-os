"use client";

import { useRef, useState, useTransition } from "react";
import { createCorrectionRequest, approveCorrectionRequest, rejectCorrectionRequest } from "@/app/(app)/attendance/correction/actions";
import { uploadProofPhoto } from "@/lib/upload-client";
import { FileDropZone } from "@/components/FileDropZone";

const TYPES: Record<string, string> = {
  MISSED_CHECK_IN: "Missed check-in",
  MISSED_CHECK_OUT: "Missed check-out",
  WRONG_STATUS: "Wrong status",
  OUTSTATION_APPROVAL: "Outstation approval",
  LATE_REASON: "Late with valid reason",
  OTHER: "Other",
};

export function CorrectionRequestForm() {
  const [pending, start] = useTransition();
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={(fd) => start(async () => {
        setErr(null); setOk(false);
        try {
          const file = fd.get("evidence");
          fd.delete("evidence");
          if (file instanceof File && file.size > 0) {
            const url = await uploadProofPhoto(file);
            if (url) fd.set("evidenceUrl", url);
          }
          await createCorrectionRequest(fd);
          ref.current?.reset(); setOk(true);
        } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
      })}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div><label className="label">Date to correct *</label><input name="date" type="date" className="input" required /></div>
      <div>
        <label className="label">Request type</label>
        <select name="requestType" className="input">{Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div><label className="label">Actual check-in time (if applicable)</label><input name="requestedCheckIn" type="time" className="input" /></div>
      <div><label className="label">Actual check-out time (if applicable)</label><input name="requestedCheckOut" type="time" className="input" /></div>
      <div className="sm:col-span-2"><label className="label">What happened? *</label><textarea name="reason" className="input min-h-20" required /></div>
      <div className="sm:col-span-2">
        <FileDropZone name="evidence" accept="image/png,image/jpeg,image/webp,application/pdf" label="Evidence (optional)" hint="photo/screenshot/PDF" />
      </div>
      {err && <div className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {ok && <div className="sm:col-span-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✅ Request submitted — Boss/HR will review it. Your original times stay on record.</div>}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={pending}>{pending ? "Submitting…" : "Submit correction request"}</button></div>
    </form>
  );
}

export function CorrectionReviewButtons({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap gap-1">
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => { const c = window.prompt("Approval note (optional):") ?? ""; start(async () => { try { await approveCorrectionRequest(requestId, c); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}>Approve</button>
      <button className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending} onClick={() => { const c = window.prompt("Reason for rejection?") ?? ""; start(async () => { try { await rejectCorrectionRequest(requestId, c); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}>Reject</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
