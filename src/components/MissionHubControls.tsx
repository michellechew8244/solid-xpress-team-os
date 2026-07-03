"use client";

import { useRef, useState, useTransition } from "react";
import { claimMission, createMission, toggleMission, seedStarterMissions } from "@/app/(app)/missions-hub/actions";

export function ClaimMissionButton({ missionId, ready, claimed }: { missionId: string; ready: boolean; claimed: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (claimed) return <span className="badge bg-green-100 text-green-700">✅ Claimed</span>;
  return (
    <span className="flex items-center gap-1">
      <button
        className={ready ? "btn-primary px-3 py-1 text-xs" : "btn-ghost px-3 py-1 text-xs opacity-60"}
        disabled={pending || !ready}
        onClick={() => { setMsg(null); start(async () => { try { await claimMission(missionId); } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } }); }}
      >
        {pending ? "Claiming…" : ready ? "🎉 Claim reward" : "In progress"}
      </button>
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </span>
  );
}

export function NewMissionForm({ types, categories }: { types: Record<string, string>; categories: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div>
      <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setOpen((o) => !o)}>＋ New mission</button>
      {open && (
        <form
          ref={ref}
          action={(fd) => start(async () => { setErr(null); try { await createMission(fd); ref.current?.reset(); setOpen(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          className="card mt-2 grid gap-2 p-3 sm:grid-cols-2"
        >
          <div className="sm:col-span-2"><label className="label">Title *</label><input name="title" className="input" required /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><input name="description" className="input" /></div>
          <div><label className="label">Type</label><select name="missionType" className="input">{Object.entries(types).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label">Category</label><select name="category" className="input">{Object.entries(categories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label">Target</label><input name="targetValue" type="number" min={1} defaultValue={1} className="input" /></div>
          <div><label className="label">Reward (💎)</label><input name="diamondReward" type="number" min={0} defaultValue={10} className="input" /></div>
          <div><label className="label">Lucky draw entries</label><input name="luckyDrawEntries" type="number" min={0} defaultValue={0} className="input" /></div>
          {err && <div className="sm:col-span-2 rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">{err}</div>}
          <div className="sm:col-span-2 flex gap-2"><button className="btn-primary px-3 py-1 text-xs" disabled={pending}>Add mission</button><button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function MissionToggle({ missionId, active }: { missionId: string; active: boolean }) {
  const [pending, start] = useTransition();
  return <button className={`badge ${active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`} disabled={pending} onClick={() => start(() => toggleMission(missionId, !active))}>{active ? "Active" : "Inactive"}</button>;
}

export function SeedMissionsButton() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => { try { await seedStarterMissions(); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}>
        {pending ? "Seeding…" : "🚀 Load starter missions"}
      </button>
      {err && <span className="ml-2 text-xs text-danger">{err}</span>}
    </span>
  );
}
