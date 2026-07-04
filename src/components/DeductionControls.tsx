"use client";

import { useState, useTransition } from "react";
import { saveDeductionRule, deleteDeductionRule, seedUniversalRules } from "@/app/(app)/performance/deduction-rules/actions";
import { createDeductionCase, submitExplanation, decideDeductionCase } from "@/app/(app)/performance/deductions/actions";

export const DEDUCTION_CATEGORIES = [
  "ATTENDANCE", "TASK_DISCIPLINE", "CUSTOMER_SERVICE", "OPERATION_MISTAKE", "FORWARDING_MISTAKE",
  "FINANCE_MISTAKE", "SALES_MISTAKE", "HANDOVER_MISTAKE", "DOCUMENTATION_MISTAKE", "INTEGRITY",
];
export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "RED_LINE"];
const lab = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText = "Saved ✓") =>
    start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Error" }); });
  return { pending, msg, run };
}

export function RuleForm({ rule, departments }: {
  rule?: { id: string; name: string; category: string; severity: string; departmentId: string | null; deductionPoints: number; description: string | null; coachingTrigger: boolean; isActive: boolean };
  departments: { id: string; name: string }[];
}) {
  const { pending, msg, run } = useRun();
  return (
    <form action={(fd) => run(() => saveDeductionRule(fd))} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <div className="col-span-2 sm:col-span-1"><label className="label">Rule name</label><input name="name" className="input" defaultValue={rule?.name ?? ""} required /></div>
      <div><label className="label">Category</label>
        <select name="category" className="input" defaultValue={rule?.category ?? "TASK_DISCIPLINE"}>{DEDUCTION_CATEGORIES.map((c) => <option key={c} value={c}>{lab(c)}</option>)}</select></div>
      <div><label className="label">Severity</label>
        <select name="severity" className="input" defaultValue={rule?.severity ?? "MEDIUM"}>{SEVERITIES.map((c) => <option key={c} value={c}>{lab(c)}</option>)}</select></div>
      <div><label className="label">Diamonds deducted</label><input name="deductionPoints" type="number" min="0" className="input" defaultValue={rule?.deductionPoints ?? 0} /></div>
      <div><label className="label">Department (blank = all)</label>
        <select name="departmentId" className="input" defaultValue={rule?.departmentId ?? ""}><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      <div className="flex items-end gap-3 pb-1">
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="coachingTrigger" defaultChecked={rule?.coachingTrigger ?? false} /> Coaching trigger</label>
      </div>
      <div className="col-span-2 sm:col-span-2"><label className="label">Description</label><input name="description" className="input" defaultValue={rule?.description ?? ""} /></div>
      <div className="flex items-end"><button className="btn-primary w-full" disabled={pending}>{rule ? "Save rule" : "＋ Add rule"}</button></div>
      {msg && <div className={`col-span-2 sm:col-span-3 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
    </form>
  );
}

export function RuleRowActions({ id }: { id: string }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="text-right">
      <button className="btn-ghost px-2 py-0.5 text-[11px] text-danger" disabled={pending}
        onClick={() => { if (confirm("Delete this rule?")) run(() => deleteDeductionRule(id), "Deleted"); }}>🗑️</button>
      {msg && !msg.ok && <div className="text-[10px] text-danger">{msg.text}</div>}
    </div>
  );
}

export function SeedRulesButton() {
  const { pending, msg, run } = useRun();
  return (
    <div>
      <button className="btn-primary" disabled={pending} onClick={() => run(() => seedUniversalRules(), "Universal rules loaded ✓")}>Load universal deduction rules</button>
      {msg && <div className={`mt-1 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
    </div>
  );
}

export function NewCaseForm({ people, rules }: {
  people: { id: string; name: string }[];
  rules: { id: string; name: string; category: string; severity: string; deductionPoints: number }[];
}) {
  const { pending, msg, run } = useRun();
  const [ruleId, setRuleId] = useState("");
  const rule = rules.find((r) => r.id === ruleId);
  return (
    <form action={(fd) => run(() => createDeductionCase(fd), "Case created — staff notified ✓")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div><label className="label">Staff</label>
        <select name="userId" className="input" required>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="col-span-1 sm:col-span-2"><label className="label">Rule (optional — fills the fields)</label>
        <select className="input" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
          <option value="">— custom case —</option>
          {rules.map((r) => <option key={r.id} value={r.id}>{r.name} (−{r.deductionPoints}💎)</option>)}
        </select></div>
      <div><label className="label">Category</label>
        <select name="category" className="input" key={`c${ruleId}`} defaultValue={rule?.category ?? "TASK_DISCIPLINE"}>{DEDUCTION_CATEGORIES.map((c) => <option key={c} value={c}>{lab(c)}</option>)}</select></div>
      <div><label className="label">Severity</label>
        <select name="severity" className="input" key={`s${ruleId}`} defaultValue={rule?.severity ?? "MEDIUM"}>{SEVERITIES.map((c) => <option key={c} value={c}>{lab(c)}</option>)}</select></div>
      <div><label className="label">Diamonds to deduct</label><input name="diamondDeducted" type="number" min="0" className="input" key={`d${ruleId}`} defaultValue={rule?.deductionPoints ?? 0} /></div>
      <div className="col-span-2 sm:col-span-3"><label className="label">Reason (facts + impact — staff will see this)</label><input name="reason" className="input" key={`r${ruleId}`} defaultValue={rule?.name ?? ""} required /></div>
      <div className="col-span-2"><label className="label">Evidence URL (optional)</label><input name="evidenceUrl" className="input" /></div>
      <div className="flex items-end"><button className="btn-primary w-full" disabled={pending}>Raise case</button></div>
      {msg && <div className={`col-span-2 sm:col-span-3 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
      <p className="col-span-2 sm:col-span-3 text-[11px] text-ink-muted">
        ⚠️ External issues (vessel delay, port congestion, customs inspection, government system down, customer late documents, weather, liner/supplier delay)
        must NOT be deducted if the staff updated properly.
      </p>
    </form>
  );
}

export function ExplainForm({ id }: { id: string }) {
  const { pending, msg, run } = useRun();
  return (
    <form action={(fd) => run(() => submitExplanation(fd), "Explanation submitted ✓")} className="mt-2 flex gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="explanation" className="input flex-1 text-xs" placeholder="Your explanation (what happened, why, evidence)…" required />
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending}>Submit</button>
      {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
    </form>
  );
}

export function DecideForm({ id }: { id: string }) {
  const { pending, msg, run } = useRun();
  return (
    <form action={(fd) => run(() => decideDeductionCase(fd), "Decided ✓")} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="finalDecision" className="input flex-1 text-xs" placeholder="Final decision note…" />
      <button name="decision" value="approve" className="btn-danger px-3 py-1 text-xs" disabled={pending}>Approve deduction</button>
      <button name="decision" value="dismiss" className="btn-ghost px-3 py-1 text-xs" disabled={pending}>Dismiss</button>
      {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
    </form>
  );
}
