"use client";

import { useState, useTransition } from "react";
import { runAnalysis } from "@/app/(app)/ai-performance-coach/actions";

type Option = { id: string; name: string };

export function AICoachPanel({ month, canBoss, canManage, departments, people }: {
  month: string; canBoss: boolean; canManage: boolean; departments: Option[]; people: Option[];
}) {
  const [pending, start] = useTransition();
  const [output, setOutput] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [type, setType] = useState(canBoss ? "COMPANY" : "STAFF");
  const [targetId, setTargetId] = useState("");
  const [m, setM] = useState(month);

  const TYPES: { key: string; label: string; who: "boss" | "manager" | "all" }[] = [
    { key: "COMPANY", label: "🏢 Company performance analysis", who: "boss" },
    { key: "BOSS_MONTHLY", label: "📊 Monthly boss report", who: "boss" },
    { key: "RISK", label: "🚨 Risk detection (billing / commission / deductions)", who: "boss" },
    { key: "DEPARTMENT", label: "🏬 Department analysis", who: "manager" },
    { key: "COACHING", label: "🎓 Coaching message draft", who: "manager" },
    { key: "STAFF", label: "👤 My performance analysis", who: "all" },
  ];
  const visible = TYPES.filter((t) => t.who === "all" || (t.who === "boss" && canBoss) || (t.who === "manager" && canManage));
  const needsDept = type === "DEPARTMENT";
  const needsPerson = type === "COACHING" || (type === "STAFF" && canManage);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Analysis</label>
          <select className="input w-72" value={type} onChange={(e) => { setType(e.target.value); setTargetId(""); }}>
            {visible.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        {needsDept && (
          <div>
            <label className="label">Department</label>
            <select className="input w-48" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">— pick —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        {needsPerson && (
          <div>
            <label className="label">Staff {type === "STAFF" ? "(blank = me)" : ""}</label>
            <select className="input w-48" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">{type === "STAFF" ? "— me —" : "— pick —"}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div><label className="label">Month</label><input type="month" className="input w-40" value={m} onChange={(e) => setM(e.target.value)} /></div>
        <button
          className="btn-primary"
          disabled={pending}
          onClick={() => start(async () => {
            setErr(null); setOutput(null);
            const fd = new FormData();
            fd.set("type", type); fd.set("month", m); fd.set("targetId", targetId);
            const r = await runAnalysis(fd);
            if (r.ok) setOutput(r.text); else setErr(r.error);
          })}
        >{pending ? "Analysing…" : "🤖 Generate analysis"}</button>
      </div>
      {err && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {output && (
        <div className="mt-4 whitespace-pre-wrap rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm leading-relaxed text-ink">
          {output}
        </div>
      )}
    </div>
  );
}
