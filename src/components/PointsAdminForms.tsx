"use client";

import { useRef, useState } from "react";
import { SPECIAL_CONTRIBUTIONS, EXTERNAL_NON_FAULT } from "@/lib/enums";
import { applyPenalty, awardContribution, adjustPoints } from "@/app/(app)/points-admin/actions";

type Person = { id: string; name: string };
type Rule = { id: string; name: string; deductionPoints: number; severity: string; isRedLine: boolean };

export function PenaltyForm({ staff, rules }: { staff: Person[]; rules: Rule[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      ref={ref}
      action={async (fd) => { setErr(null); try { await applyPenalty(fd); ref.current?.reset(); setOk(true); setTimeout(() => setOk(false), 2500); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Staff</label>
          <select name="staffId" className="input" required><option value="">— select —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
        <div>
          <label className="label">Penalty rule</label>
          <select name="ruleId" className="input" required>
            <option value="">— select —</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.isRedLine ? "RED LINE" : `-${r.deductionPoints}`})</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Note (what happened)</label>
        <input name="note" className="input" placeholder="Brief description of the internal mistake" />
      </div>
      <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        <strong>Do not penalise external problems.</strong> These are not staff fault: {EXTERNAL_NON_FAULT.join(", ")}.
        <label className="mt-2 flex items-center gap-2 font-semibold text-ink">
          <input type="checkbox" name="internalCause" className="h-4 w-4" required />
          I confirm this was caused by an internal mistake (poor follow-up, missing update, wrong entry, late submission, negligence).
        </label>
      </div>
      <button className="btn-danger" type="submit">Apply Penalty</button>
      {ok && <span className="ml-2 text-sm font-semibold text-ok">✓ Applied</span>}
      {err && <div className="text-sm text-danger">{err}</div>}
    </form>
  );
}

export function RecognitionForm({ staff }: { staff: Person[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [points, setPoints] = useState(SPECIAL_CONTRIBUTIONS[0].points);
  const [label, setLabel] = useState(SPECIAL_CONTRIBUTIONS[0].name);
  const [ok, setOk] = useState(false);

  return (
    <form ref={ref} action={async (fd) => { await awardContribution(fd); ref.current?.reset(); setOk(true); setTimeout(() => setOk(false), 2500); }} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Staff</label>
          <select name="staffId" className="input" required><option value="">— select —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
        <div>
          <label className="label">Contribution</label>
          <select className="input" value={label} onChange={(e) => { const c = SPECIAL_CONTRIBUTIONS.find((x) => x.name === e.target.value)!; setLabel(c.name); setPoints(c.points); }}>
            {SPECIAL_CONTRIBUTIONS.map((c) => <option key={c.name} value={c.name}>{c.name} (+{c.points})</option>)}
          </select>
        </div>
      </div>
      <input type="hidden" name="label" value={label} />
      <input type="hidden" name="type" value="MANUAL" />
      <div className="w-40">
        <label className="label">Points</label>
        <input name="points" type="number" className="input" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
      </div>
      <button className="btn-primary" type="submit">Award Recognition</button>
      {ok && <span className="ml-2 text-sm font-semibold text-ok">✓ Awarded</span>}
    </form>
  );
}

export function AdjustForm({ staff }: { staff: Person[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [ok, setOk] = useState(false);
  return (
    <form ref={ref} action={async (fd) => { await adjustPoints(fd); ref.current?.reset(); setOk(true); setTimeout(() => setOk(false), 2500); }} className="flex flex-wrap items-end gap-2">
      <div><label className="label">Staff</label><select name="staffId" className="input w-44" required><option value="">— select —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label className="label">Amount (±)</label><input name="amount" type="number" className="input w-28" placeholder="e.g. -10" required /></div>
      <div className="flex-1"><label className="label">Reason</label><input name="reason" className="input" required /></div>
      <button className="btn-ghost" type="submit">Adjust</button>
      {ok && <span className="text-sm font-semibold text-ok">✓</span>}
    </form>
  );
}
