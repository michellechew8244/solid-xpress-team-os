"use client";

import { useState, useTransition } from "react";
import { Avatar, Progress } from "@/components/ui";
import { coachToNextLevel } from "@/app/(app)/badges/growth-actions";

export interface TeamGrowthRowVM {
  userId: string;
  name: string;
  avatarColor: string;
  department: string;
  currentLevel: number;
  currentLevelName: string;
  nextLevel: number | null;
  nextLevelName: string | null;
  progressPercent: number;
  missingHeadline: string;
  badgeCount: number;
  lifetimePoints: number;
  latestGrade: string | null;
}

/** Section 7 — Team Growth Overview (Boss / HR / Department Head). */
export function TeamGrowthTable({ rows }: { rows: TeamGrowthRowVM[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
            <th className="px-3 py-2">Staff</th><th className="px-3">Department</th><th className="px-3">Current Level</th>
            <th className="px-3">Next Level</th><th className="px-3">Progress</th><th className="px-3">Missing</th>
            <th className="px-3 text-right">Badges</th><th className="px-3 text-right">Diamonds</th><th className="px-3">Grade</th><th className="px-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => <TeamGrowthRow key={r.userId} row={r} />)}
          {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-ink-muted">No team members to show.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TeamGrowthRow({ row }: { row: TeamGrowthRowVM }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <Avatar name={row.name} color={row.avatarColor} size={26} />
            <span className="font-medium text-ink">{row.name}</span>
          </div>
        </td>
        <td className="px-3 text-ink-soft">{row.department}</td>
        <td className="px-3">Lv.{row.currentLevel} {row.currentLevelName}</td>
        <td className="px-3 text-brand-700">{row.nextLevel ? `Lv.${row.nextLevel} ${row.nextLevelName}` : "Max level"}</td>
        <td className="px-3">
          <div className="flex items-center gap-2">
            <div className="w-24"><Progress value={row.progressPercent} rag={row.progressPercent >= 100 ? "ok" : "warn"} /></div>
            <span className="text-xs text-ink-muted">{row.progressPercent}%</span>
          </div>
        </td>
        <td className="max-w-[220px] px-3 text-xs text-ink-muted">{row.missingHeadline}</td>
        <td className="px-3 text-right">{row.badgeCount}</td>
        <td className="px-3 text-right">{row.lifetimePoints.toLocaleString()}</td>
        <td className="px-3">{row.latestGrade ? row.latestGrade.replace("A_PLUS", "A+") : "—"}</td>
        <td className="px-3"><button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen((o) => !o)}>Coach to Next Level</button></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={10} className="bg-slate-50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <input className="input flex-1" placeholder="Coaching note for this staff member…" value={msg} onChange={(e) => setMsg(e.target.value)} />
              <button
                className="btn-primary px-3 py-1.5 text-xs"
                disabled={pending}
                onClick={() => start(async () => { await coachToNextLevel(row.userId, msg); setMsg(""); setSent(true); setOpen(false); })}
              >
                Send
              </button>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </td>
        </tr>
      )}
      {sent && !open && (
        <tr><td colSpan={10} className="px-3 pb-2 text-xs text-ok">Coaching note sent to {row.name}.</td></tr>
      )}
    </>
  );
}
