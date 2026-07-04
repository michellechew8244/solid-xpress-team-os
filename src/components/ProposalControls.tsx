"use client";

import { useRef, useState, useTransition } from "react";
import { createProposal, firstStageReview, acceptProposal, rejectProposal, markImplemented } from "@/app/(app)/proposals/actions";
import { PROPOSAL_CATEGORIES } from "@/lib/proposals";
import { uploadProofPhoto } from "@/lib/upload-client";
import { FileDropZone } from "@/components/FileDropZone";

type Dept = { id: string; name: string };

export function NewProposalForm({ departments }: { departments: Dept[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <div>
      <button className="btn-primary" onClick={() => { setOk(false); setOpen((o) => !o); }}>💡 Submit an Idea</button>
      {ok && !open && <div className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✅ Idea submitted — thank you! It goes to your Department Head first.</div>}
      {open && (
        <form
          ref={ref}
          action={(fd) => start(async () => {
            setErr(null);
            try {
              const file = fd.get("attachment");
              fd.delete("attachment");
              if (file instanceof File && file.size > 0) {
                const url = await uploadProofPhoto(file);
                if (url) fd.set("attachmentUrl", url);
              }
              await createProposal(fd);
              ref.current?.reset(); setOpen(false); setOk(true);
            } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
          })}
          className="card mt-3 grid gap-3 p-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2"><label className="label">Proposal title *</label><input name="title" className="input" required /></div>
          <div>
            <label className="label">Category *</label>
            <select name="category" className="input" required>{Object.entries(PROPOSAL_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div>
            <label className="label">Department impacted</label>
            <select name="impactedDepartmentId" className="input"><option value="">— whole company —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </div>
          <div className="sm:col-span-2"><label className="label">Problem observed *</label><textarea name="problemObserved" className="input min-h-16" required /></div>
          <div className="sm:col-span-2"><label className="label">Proposed solution *</label><textarea name="proposedSolution" className="input min-h-16" required /></div>
          <div><label className="label">Expected benefit</label><input name="expectedBenefit" className="input" /></div>
          <div><label className="label">Estimated saving / revenue impact (RM)</label><input name="estimatedImpactValue" type="number" min={0} step="any" className="input" /></div>
          <div className="sm:col-span-2"><FileDropZone name="attachment" accept="image/png,image/jpeg,image/webp,application/pdf" label="Attachment / evidence (optional)" hint="image or PDF" /></div>
          {err && <div className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="sm:col-span-2 flex gap-2"><button className="btn-primary" disabled={pending}>{pending ? "Submitting…" : "Submit proposal"}</button><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function ProposalReviewButtons({ proposalId, status, canFinal, canImplement, suggested, implementedDefault = 300 }: {
  proposalId: string; status: string; canFinal: boolean; canImplement: boolean; suggested: number; implementedDefault?: number;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => { setErr(null); start(async () => { try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); };

  return (
    <span className="flex flex-wrap items-center gap-1">
      {["SUBMITTED", "REVISION_REQUESTED"].includes(status) && (
        <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => { const c = window.prompt("First-review note (optional):") ?? ""; run(() => firstStageReview(proposalId, "REVIEW", c)); }}>👀 Move to review</button>
      )}
      {["SUBMITTED", "UNDER_REVIEW"].includes(status) && (
        <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => { const c = window.prompt("What should be improved?") ?? ""; if (c) run(() => firstStageReview(proposalId, "REQUEST_REVISION", c)); }}>✏️ Request revision</button>
      )}
      {canFinal && ["SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED"].includes(status) && (
        <>
          <button className="btn-primary px-2 py-1 text-xs" disabled={pending} onClick={() => {
            const amt = window.prompt(`Diamonds to award for acceptance? (suggested: ${suggested})`, String(suggested));
            if (amt == null) return;
            const c = window.prompt("Acceptance note (optional):") ?? "";
            run(() => acceptProposal(proposalId, Number(amt) || 0, c));
          }}>✅ Accept</button>
          <button className="btn-ghost px-2 py-1 text-xs text-danger" disabled={pending} onClick={() => { const c = window.prompt("Constructive feedback (required):") ?? ""; if (c) run(() => rejectProposal(proposalId, c)); }}>Reject</button>
        </>
      )}
      {canImplement && status === "ACCEPTED" && (
        <button className="btn-primary px-2 py-1 text-xs" disabled={pending} onClick={() => {
          const amt = window.prompt(`Extra diamonds for implementation? (suggested: ${implementedDefault})`, String(implementedDefault));
          if (amt == null) return;
          const c = window.prompt("Implementation note (optional):") ?? "";
          run(() => markImplemented(proposalId, Number(amt) || 0, c));
        }}>🚀 Mark implemented</button>
      )}
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
