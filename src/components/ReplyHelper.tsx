"use client";

import { useState, useTransition } from "react";
import { draftCustomerReply, draftSalesMessage, draftOpsStatusUpdate, saveTemplate, deleteTemplate, type DraftResult } from "@/app/(app)/ai-response-centre/actions";
import type { Playbook } from "@/lib/ai-reply";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-primary px-3 py-1 text-xs"
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >{copied ? "Copied ✓" : "📋 Copy"}</button>
  );
}

/** "Help me reply" — staff paste a customer message and get a draft. */
export function ReplyHelper({ claudeOn }: { claudeOn: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DraftResult | null>(null);

  return (
    <div>
      <form
        action={(fd) => start(async () => setResult(await draftCustomerReply(fd)))}
        className="grid gap-2"
      >
        <div>
          <label className="label">Paste the customer&apos;s message (don&apos;t know how to reply? Paste it here) *</label>
          <textarea name="message" className="input min-h-28" placeholder="e.g. 'Why is my container still not released? This is the second time it's delayed and my customer is chasing me...'" required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Tone</label>
            <select name="tone" className="input">
              <option value="PROFESSIONAL">🤝 Professional</option>
              <option value="FRIENDLY">😊 Friendly</option>
              <option value="APOLOGETIC">🙏 Apologetic (complaints/delays)</option>
            </select>
          </div>
          <div>
            <label className="label">Extra context (optional)</label>
            <input name="context" className="input" placeholder="e.g. vessel rolled at PTP, new ETA Friday" />
          </div>
        </div>
        <button className="btn-primary" disabled={pending}>{pending ? "Drafting…" : "🤖 Draft my reply"}</button>
      </form>
      <p className="mt-1 text-[11px] text-ink-muted">
        Engine: {claudeOn ? "Claude AI + Solid Xpress playbooks" : "built-in expertise playbooks"}. Unknown facts stay as {"{placeholders}"} — never send unconfirmed rates, dates or promises.
      </p>

      {result && !result.ok && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{result.error}</div>}
      {result && result.ok && (
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-ink-muted">
            <span className="badge bg-indigo-100 text-indigo-700">{result.intentLabel}</span>
            <span className="badge bg-slate-100 text-slate-600">{result.engine === "claude" ? "Claude draft" : "playbook draft"}</span>
          </div>
          <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed">{result.draft}</div>
          <div className="mt-2 flex items-center gap-2">
            <CopyButton text={result.draft} />
            <span className="text-xs text-amber-600">⚠️ Review and fill {"{placeholders}"} before sending.</span>
          </div>
          {result.tips.length > 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              <b>Coach tips for this situation:</b>
              <ul className="mt-1 list-disc pl-4">{result.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Operation status update — drafts from the job's real milestones/ETA. */
export function OpsStatusDraft({ jobs, claudeOn }: { jobs: { id: string; label: string }[]; claudeOn: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DraftResult | null>(null);

  if (jobs.length === 0) {
    return <p className="text-sm text-ink-muted">No jobs on the Job Board yet — create jobs there and this tool drafts status updates from their real milestones, vessel and ETA/ETD.</p>;
  }
  return (
    <div>
      <form action={(fd) => start(async () => setResult(await draftOpsStatusUpdate(fd)))} className="grid gap-2 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Job *</label>
          <select name="jobId" className="input" required>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Send to</label>
          <select name="audience" className="input">
            <option value="CUSTOMER">🚢 Customer update</option>
            <option value="INTERNAL">🔁 Internal CS handover</option>
          </select>
        </div>
        <div className="flex items-end"><button className="btn-primary w-full" disabled={pending}>{pending ? "Drafting…" : "🤖 Draft update"}</button></div>
        <div className="sm:col-span-4">
          <label className="label">Extra note (optional — e.g. &quot;vessel rolled, new ETA Friday&quot;)</label>
          <input name="note" className="input" />
        </div>
      </form>
      <p className="mt-1 text-[11px] text-ink-muted">Facts come straight from the job&apos;s milestones, vessel and ETA/ETD — nothing is invented. Engine: {claudeOn ? "Claude + job data" : "job data"}.</p>

      {result && !result.ok && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{result.error}</div>}
      {result && result.ok && (
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="badge bg-indigo-100 text-indigo-700">{result.intentLabel}</span>
            <span className="badge bg-slate-100 text-slate-600">{result.engine === "claude" ? "Claude draft" : "from job data"}</span>
          </div>
          <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed">{result.draft}</div>
          <div className="mt-2 flex items-center gap-2">
            <CopyButton text={result.draft} />
            <span className="text-xs text-amber-600">⚠️ Check the milestones are current before sending.</span>
          </div>
          {result.tips.length > 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              <ul className="list-disc pl-4">{result.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Sales coach — follow-up & closing playbooks with adaptable scripts. */
export function SalesCoach({ playbooks, claudeOn }: { playbooks: Playbook[]; claudeOn: boolean }) {
  const [key, setKey] = useState(playbooks[0]?.key ?? "");
  const pb = playbooks.find((p) => p.key === key);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DraftResult | null>(null);

  if (!pb) return null;
  return (
    <div>
      <label className="label">Situation</label>
      <select className="input" value={key} onChange={(e) => { setKey(e.target.value); setResult(null); }}>
        {playbooks.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
      </select>
      <p className="mt-1 text-xs text-ink-muted"><b>When:</b> {pb.when}</p>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="text-xs font-bold uppercase text-ink-muted">Play (steps)</div>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink-soft">{pb.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <div className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
            <b>💡 Expert tips:</b>
            <ul className="mt-1 list-disc pl-4">{pb.expertTips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase text-ink-muted">Message script (copy &amp; adapt)</div>
          <div className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed">{result?.ok ? result.draft : pb.script}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CopyButton text={result?.ok ? result.draft : pb.script} />
            {result?.ok && <span className="badge bg-slate-100 text-slate-600">{result.engine === "claude" ? "Claude draft" : "playbook script"}</span>}
          </div>
          <form
            action={(fd) => start(async () => setResult(await draftSalesMessage(fd)))}
            className="mt-3 grid gap-2"
          >
            <input type="hidden" name="script" value={pb.script} />
            <label className="label">Personalise it — describe your customer &amp; situation{claudeOn ? "" : " (needs AI key — using base script meanwhile)"}</label>
            <textarea name="situation" className="input min-h-20 text-xs" placeholder="e.g. Ocean Traders, quoted PKG→Jakarta 2x40ft rubber gloves last Tuesday, said price 10% above competitor, ships monthly" />
            <button className="btn-ghost" disabled={pending}>{pending ? "Drafting…" : "✨ Tailor this message to my customer"}</button>
            {result && !result.ok && <div className="text-xs text-danger">{result.error}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}

/** Boss/HR template management: add / edit / delete copy-paste templates. */
export function TemplateManager({ templates }: { templates: { id: string; templateType: string; title: string; responseText: string; departmentEligibility: string; isActive: boolean }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const editing = editId === "new" ? null : templates.find((t) => t.id === editId);

  const submit = (fd: FormData) => start(async () => {
    setMsg(null);
    const r = await saveTemplate(fd);
    setMsg(r.ok ? { ok: true, text: "Template saved ✓" } : { ok: false, text: r.error });
    if (r.ok) setEditId(null);
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <div className="font-semibold text-ink">{t.title}{!t.isActive && <span className="badge ml-1 bg-slate-200 text-slate-600">hidden</span>}</div>
            <div className="mt-1 flex gap-1">
              <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => { setEditId(t.id); setMsg(null); }}>✏️ Edit</button>
              <button className="btn-ghost px-2 py-0.5 text-[11px] text-danger" disabled={pending}
                onClick={() => { if (confirm(`Delete template "${t.title}"?`)) start(async () => { const r = await deleteTemplate(t.id); if (!r.ok) setMsg({ ok: false, text: r.error }); }); }}>🗑️</button>
            </div>
          </div>
        ))}
        <button className="rounded-xl border border-dashed border-brand-300 px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50" onClick={() => { setEditId("new"); setMsg(null); }}>＋ Add template</button>
      </div>

      {editId && (
        <form action={submit} className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Title *</label><input name="title" className="input" defaultValue={editing?.title ?? ""} placeholder="e.g. DO release notification" required /></div>
            <div><label className="label">Type key</label><input name="templateType" className="input" defaultValue={editing?.templateType ?? ""} placeholder="e.g. DO_RELEASE" /></div>
          </div>
          <div>
            <label className="label">Message text * — use {"{placeholders}"} like {"{customerName}"} or {"{jobNo}"} for parts staff fill in</label>
            <textarea name="responseText" className="input min-h-36" defaultValue={editing?.responseText ?? "Dear {customerName},\n\n\n\nThank you.\nSolid Xpress M Sdn Bhd"} required />
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Add template"}</button>
            <button type="button" className="btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
            {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
          </div>
        </form>
      )}
      {!editId && msg && <div className={`mt-2 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
    </div>
  );
}
