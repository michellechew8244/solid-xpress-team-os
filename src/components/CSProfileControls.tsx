"use client";

import { useState, useTransition } from "react";
import { assignCSProfile, removeCSProfile, saveCaseCredit, seedResultDefaults, saveTeamHeadResult } from "@/app/(app)/goals/cs-profiles/actions";
import { CS_PROFILE_TYPES } from "@/lib/result-data";

const lab = (s: string) => s.replace(/^CS_/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText = "Saved ✓") =>
    start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Error" }); });
  return { pending, msg, run };
}

export function AssignProfileForm({ people }: { people: { id: string; name: string }[] }) {
  const { pending, msg, run } = useRun();
  return (
    <form action={(fd) => run(() => assignCSProfile(fd))} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label">Staff</label>
        <select name="userId" className="input w-48">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div>
        <label className="label">Role profile</label>
        <select name="profileType" className="input w-56">
          {CS_PROFILE_TYPES.map((t) => <option key={t} value={t}>{lab(t)}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Workload benchmark (credits/mo)</label>
        <input name="monthlyWorkloadBenchmark" type="number" className="input w-32" defaultValue={60} />
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "…" : "Assign profile"}</button>
      {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
    </form>
  );
}

export function RemoveProfileButton({ userId }: { userId: string }) {
  const { pending, run } = useRun();
  return <button className="btn-ghost px-2 py-0.5 text-[11px] text-danger" disabled={pending} onClick={() => run(() => removeCSProfile(userId), "Removed")}>remove</button>;
}

export function CaseCreditRow({ workType, baseCredit, description }: { workType: string; baseCredit: number; description: string | null }) {
  const { pending, msg, run } = useRun();
  return (
    <form action={(fd) => run(() => saveCaseCredit(fd))} className="flex items-center gap-2 border-b border-slate-50 py-1">
      <input type="hidden" name="workType" value={workType} />
      <input type="hidden" name="description" value={description ?? ""} />
      <span className="w-56 text-xs">{description ?? workType.replace(/_/g, " ")}</span>
      <input name="baseCredit" type="number" step="0.5" min={0} className="input w-20 py-0.5 text-xs" defaultValue={baseCredit} />
      <button className="btn-ghost px-2 py-0.5 text-[11px]" disabled={pending}>save</button>
      {msg && <span className={`text-[10px] ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
    </form>
  );
}

export function SeedResultDefaultsButton() {
  const { pending, msg, run } = useRun();
  return (
    <div>
      <button className="btn-primary" disabled={pending} onClick={() => run(() => seedResultDefaults(), "Defaults loaded ✓")}>Load default case credits + result areas</button>
      {msg && <div className={`mt-1 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
    </div>
  );
}

export function TeamHeadResultForm({ heads, month, existing }: {
  heads: { id: string; name: string }[];
  month: string;
  existing: { teamHeadId: string; teamScoreImprovement: number; repeatedMistakeReduction: number; backupPersonReady: boolean; juniorStaffIndependent: boolean; inquiryBacklogReduction: number; sopImpactResult: string | null } | null;
}) {
  const { pending, msg, run } = useRun();
  return (
    <form action={(fd) => run(() => saveTeamHeadResult(fd))} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div>
        <label className="label">Team head</label>
        <select name="teamHeadId" className="input" defaultValue={existing?.teamHeadId ?? ""}>{heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
      </div>
      <div><label className="label">Month</label><input name="month" type="month" className="input" defaultValue={month} /></div>
      <div><label className="label">Team score improvement (pts)</label><input name="teamScoreImprovement" type="number" step="0.1" className="input" defaultValue={existing?.teamScoreImprovement ?? 0} /></div>
      <div><label className="label">Repeated mistakes reduced (count)</label><input name="repeatedMistakeReduction" type="number" className="input" defaultValue={existing?.repeatedMistakeReduction ?? 0} /></div>
      <div><label className="label">Inquiry backlog reduction (count)</label><input name="inquiryBacklogReduction" type="number" className="input" defaultValue={existing?.inquiryBacklogReduction ?? 0} /></div>
      <div className="flex items-end gap-3 pb-1 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" name="backupPersonReady" defaultChecked={existing?.backupPersonReady} /> Backup person ready</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="juniorStaffIndependent" defaultChecked={existing?.juniorStaffIndependent} /> Junior independent</label>
      </div>
      <div className="col-span-2"><label className="label">SOP impact result (which error did it reduce?)</label><input name="sopImpactResult" className="input" defaultValue={existing?.sopImpactResult ?? ""} /></div>
      <div><label className="label">Evidence URL</label><input name="evidenceUrl" className="input" /></div>
      <div className="col-span-2 sm:col-span-3"><button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save team head result"}</button> {msg && <span className={`ml-2 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}</div>
    </form>
  );
}
