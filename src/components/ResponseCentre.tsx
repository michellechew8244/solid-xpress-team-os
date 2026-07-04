"use client";

import { useMemo, useState } from "react";

export interface Template { id: string; templateType: string; title: string; responseText: string }

/** Extract {placeholders} from a template. */
function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]))];
}

export function ResponseCentre({ templates }: { templates: Template[] }) {
  const [selId, setSelId] = useState(templates[0]?.id ?? "");
  const sel = templates.find((t) => t.id === selId);
  const vars = useMemo(() => (sel ? placeholders(sel.responseText) : []), [sel]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const output = sel
    ? sel.responseText.replace(/\{([^}]+)\}/g, (_, k: string) => values[k]?.trim() || `{${k}}`)
    : "";
  const filled = vars.every((v) => values[v]?.trim());

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <label className="label">Template</label>
        <select className="input" value={selId} onChange={(e) => { setSelId(e.target.value); setValues({}); setCopied(false); }}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {vars.map((v) => (
            <div key={v}>
              <label className="label">{v}</label>
              <input className="input" value={values[v] ?? ""} onChange={(e) => setValues((s) => ({ ...s, [v]: e.target.value }))} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Draft (review before sending)</label>
        <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed">{output || "Pick a template."}</div>
        <div className="mt-2 flex items-center gap-2">
          <button
            className="btn-primary"
            disabled={!sel}
            onClick={async () => { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          >{copied ? "Copied ✓" : "📋 Copy draft"}</button>
          {!filled && vars.length > 0 && <span className="text-xs text-amber-600">Fill all fields — unfilled {`{placeholders}`} stay visible so nothing false is sent.</span>}
        </div>
        <p className="mt-2 text-xs text-ink-muted">⚠️ Please review before sending. Never promise clearance times, duty amounts or approvals that are not confirmed.</p>
      </div>
    </div>
  );
}
