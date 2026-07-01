"use client";

import { useRef, useState } from "react";
import { awardBadge } from "@/app/(app)/badges/actions";

export function AwardBadgeForm({
  staff,
  badges,
}: {
  staff: { id: string; name: string }[];
  badges: { id: string; name: string; icon: string; pointsBonus: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <div>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>🏅 Award Badge</button>
      {open && (
        <form
          ref={ref}
          action={async (fd) => { setMsg(null); try { await awardBadge(fd); ref.current?.reset(); setMsg("Badge awarded ✓"); } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } }}
          className="card mt-3 grid gap-3 p-4 sm:grid-cols-2"
        >
          <div>
            <label className="label">Staff</label>
            <select name="userId" className="input" required><option value="">— select —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </div>
          <div>
            <label className="label">Badge</label>
            <select name="badgeId" className="input" required><option value="">— select —</option>{badges.map((b) => <option key={b.id} value={b.id}>{b.icon} {b.name} (+{b.pointsBonus})</option>)}</select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Reason</label>
            <input name="reason" className="input" placeholder="Why is this badge being awarded?" />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit">Award</button>
            <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
            {msg && <span className="text-sm text-ink-muted">{msg}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
