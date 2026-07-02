"use client";

import { useRef, useState, useTransition } from "react";
import { clockIn, clockOut, markAttendance } from "@/app/(app)/attendance/actions";
import { uploadProofPhoto } from "@/lib/upload-client";
import { FileDropZone } from "@/components/FileDropZone";

export function ClockButtons({ clockedIn, clockedOut }: { clockedIn: boolean; clockedOut: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // Uploads the selected photo (if any) straight to cloud storage, then clocks.
  const run = (fn: (photoUrl?: string | null) => Promise<unknown>) => {
    setErr(null);
    start(async () => {
      try {
        const file = photoRef.current?.files?.[0];
        const photoUrl = file && file.size > 0 ? await uploadProofPhoto(file) : null;
        await fn(photoUrl);
        if (photoRef.current) photoRef.current.value = "";
      } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  };

  const done = clockedIn && clockedOut;
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {!done && (
        <div className="w-full sm:w-64">
          {/* key remounts the zone after each clock action so the old file is cleared */}
          <FileDropZone
            key={`${clockedIn}-${clockedOut}`}
            name="photo"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            label="📷 Photo proof (optional)"
            hint="PNG/JPG/WebP · drag it in or tap to snap"
            inputRef={photoRef}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!clockedIn && <button className="btn-primary" disabled={pending} onClick={() => run(clockIn)}>{pending ? "Uploading…" : "🕘 Clock In"}</button>}
        {clockedIn && !clockedOut && <button className="btn-primary" disabled={pending} onClick={() => run(clockOut)}>{pending ? "Uploading…" : "🕔 Clock Out"}</button>}
        {done && <span className="text-sm font-semibold text-ok">✅ Done for today</span>}
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </div>
  );
}

export function MarkAttendanceForm({ staff }: { staff: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={(fd) => { setMsg(null); start(async () => { try { await markAttendance(fd); setMsg({ ok: true, text: "Saved." }); ref.current?.reset(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" }); } }); }}
      className="flex flex-wrap items-end gap-2"
    >
      <div><label className="label">Staff</label>
        <select name="userId" className="input w-44" required><option value="">— select —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      <div><label className="label">Date</label><input name="date" type="date" className="input" required /></div>
      <div><label className="label">Status</label>
        <select name="status" className="input w-32"><option value="ABSENT">Absent</option><option value="LEAVE">Leave</option><option value="PRESENT">Present</option><option value="LATE">Late</option></select>
      </div>
      <div><label className="label">Note</label><input name="note" className="input w-44" /></div>
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending}>Save</button>
      {msg && <span className={msg.ok ? "text-xs text-ok" : "text-xs text-danger"}>{msg.text}</span>}
    </form>
  );
}
