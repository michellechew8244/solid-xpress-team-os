"use client";

import { useRef, useState, useTransition } from "react";
import { clockIn, clockOut, markAttendance } from "@/app/(app)/attendance/actions";

export function ClockButtons({ clockedIn, clockedOut }: { clockedIn: boolean; clockedOut: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => { setErr(null); start(async () => { try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!clockedIn && <button className="btn-primary" disabled={pending} onClick={() => run(clockIn)}>🕘 Clock In</button>}
      {clockedIn && !clockedOut && <button className="btn-primary" disabled={pending} onClick={() => run(clockOut)}>🕔 Clock Out</button>}
      {clockedIn && clockedOut && <span className="text-sm font-semibold text-ok">✅ Done for today</span>}
      {err && <span className="text-xs text-danger">{err}</span>}
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
