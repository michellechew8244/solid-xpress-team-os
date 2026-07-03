"use client";

import { useRef, useState, useTransition } from "react";
import { createPKCampaign, cancelPKCampaign, finalizePKCampaign } from "@/app/(app)/pk-arena/actions";

export function NewPKCampaignForm({ metrics }: { metrics: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>⚔️ New PK Campaign</button>
      {open && (
        <form
          ref={ref}
          action={(fd) => start(async () => { setErr(null); try { await createPKCampaign(fd); ref.current?.reset(); setOpen(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          className="card mt-3 grid gap-3 p-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2"><label className="label">Title *</label><input name="title" className="input" placeholder="e.g. Attendance Hero July" required /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><input name="description" className="input" /></div>
          <div>
            <label className="label">PK type</label>
            <select name="pkType" className="input"><option value="INDIVIDUAL">🧍 Individual PK</option><option value="DEPARTMENT">🏢 Department PK</option></select>
          </div>
          <div>
            <label className="label">Metric</label>
            <select name="metricType" className="input">{Object.entries(metrics).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div><label className="label">Start date</label><input name="startDate" type="date" className="input" required /></div>
          <div><label className="label">End date</label><input name="endDate" type="date" className="input" required /></div>
          <div><label className="label">🥇 1st place (💎)</label><input name="rewardFirstPlace" type="number" min={0} defaultValue={300} className="input" /></div>
          <div><label className="label">🥈 2nd place (💎)</label><input name="rewardSecondPlace" type="number" min={0} defaultValue={200} className="input" /></div>
          <div><label className="label">🥉 3rd place (💎)</label><input name="rewardThirdPlace" type="number" min={0} defaultValue={100} className="input" /></div>
          <div><label className="label">Team reward per member (💎, dept PK)</label><input name="teamReward" type="number" min={0} defaultValue={150} className="input" /></div>
          {err && <div className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="sm:col-span-2 flex gap-2"><button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Launch campaign"}</button><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function PKCampaignAdminButtons({ campaignId, status, canFinalize }: { campaignId: string; status: string; canFinalize: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (status === "COMPLETED" || status === "CANCELLED") return null;
  return (
    <span className="flex flex-wrap gap-1">
      {canFinalize && (
        <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => {
          const override = window.confirm("Include red-line staff in payouts? OK = override (include them), Cancel = standard fairness rules.");
          if (!window.confirm("Finalize this campaign and pay the winners now?")) return;
          start(async () => { try { await finalizePKCampaign(campaignId, override); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } });
        }}>🏁 Finalize & pay winners</button>
      )}
      <button className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending} onClick={() => { if (window.confirm("Cancel this campaign?")) start(async () => { try { await cancelPKCampaign(campaignId); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}>Cancel</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
